import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { shopify } from '../../config/shopify.js';
import { cloudinary } from '../../lib/cloudinary.js';
import { conversionJobsRepo } from '../../models/conversionJobsRepo.js';
import { conversionBatchesRepo } from '../../models/conversionBatchesRepo.js';
import { claimConversionJobCreation } from '../../services/idempotency.js';
import { assertQuotaAvailable, getUsageSummary } from '../../services/imageOptimizerQuota.js';
import { SUPPORTED_INPUT_FORMATS, SUPPORTED_OUTPUT_FORMATS } from '../../services/imageConversion.js';
import { restoreProductImage, ShopifyMediaReplaceError } from '../../services/shopifyMediaReplace.js';
import { imageOptimizerWorker } from '../../services/imageOptimizerWorker.js';
import {
  createImageOptimizerSubscription,
  reconcileBillingState,
} from '../../services/billing.js';
import { env, isProduction } from '../../config/env.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const IMAGES_WITH_MEDIA_ID_QUERY = `#graphql
  query ProductsForOptimizer($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        node {
          id
          title
          images(first: 20) {
            edges {
              node { id url width height }
            }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

// GET /api/image-optimizer/usage
router.get('/image-optimizer/usage', async (req, res) => {
  const usage = await getUsageSummary(req.shopDomain);
  res.json(usage);
});

// GET /api/image-optimizer/images — dedicated product+image listing carrying each image's
// Shopify media GID, needed to target productDeleteMedia for the replace-in-place pipeline. Kept
// separate from GET /api/products (used by the custom-prompt studio) rather than adding `id` to
// that endpoint's `images` array, since several existing pages already consume that array as
// plain URL strings.
router.get('/image-optimizer/images', async (req, res) => {
  const { cursor } = req.query;
  const client = new shopify.api.clients.Graphql({ session: req.shopSession });
  const response = await client.request(IMAGES_WITH_MEDIA_ID_QUERY, {
    variables: { first: 25, after: typeof cursor === 'string' ? cursor : null },
  });

  const products = response.data.products.edges.map(({ node }) => ({
    id: node.id,
    title: node.title,
    images: node.images.edges.map(({ node: image }) => ({
      mediaId: image.id,
      url: image.url,
      width: image.width,
      height: image.height,
    })),
  }));

  res.json({ products, pageInfo: response.data.products.pageInfo });
});

// POST /api/image-optimizer/upload — for images the merchant drags in directly rather than
// picking from the store catalog (e.g. a fresh asset not yet on any product). Accepts a single
// multipart file, uploads it to Cloudinary's originals folder, and returns a sourceUrl the
// convert endpoint below can use exactly like a Shopify CDN URL — the conversion pipeline doesn't
// care where a source image came from.
router.post('/image-optimizer/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded (expected multipart field "file").' });
  }

  const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder: `shopify-optimizer/${req.shopDomain}/originals`,
    resource_type: 'image',
  });

  const inputFormat = (result.format ?? '').toLowerCase();
  if (!SUPPORTED_INPUT_FORMATS.includes(inputFormat)) {
    return res.status(400).json({ error: `Unsupported image format: ${inputFormat || 'unknown'}` });
  }

  return res.status(201).json({ sourceUrl: result.secure_url, inputFormat, isAnimatedGif: Boolean(result.is_animated) });
});

const convertImageSchema = z.object({
  sourceUrl: z.string().url(),
  inputFormat: z.enum(SUPPORTED_INPUT_FORMATS),
  productId: z.string().optional(),
  mediaId: z.string().optional(),
  isAnimatedGif: z.coerce.boolean().optional().default(false),
});

const convertRequestSchema = z
  .object({
    idempotencyKey: z.string().min(1),
    images: z.array(convertImageSchema).min(1).max(100),
    outputFormats: z.array(z.enum(SUPPORTED_OUTPUT_FORMATS)).min(1).max(2),
    quality: z.coerce.number().int().min(1).max(100).optional(),
    replaceInPlace: z.coerce.boolean().optional().default(false),
  })
  .superRefine((body, ctx) => {
    if (!body.replaceInPlace) return;
    body.images.forEach((image, index) => {
      if (!image.productId || !image.mediaId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['images', index],
          message: 'replaceInPlace requires productId and mediaId — pick this image from Store Images, not Upload.',
        });
      }
    });
  });

// POST /api/image-optimizer/convert — fans out into one conversion_jobs doc per image, all
// sharing one conversion_batches doc, same "one batch, N per-item jobs" shape as
// POST /api/generate/bulk. Quota is only CHECKED here (assertQuotaAvailable) — actual consumption
// happens once per job, at that job's completion in the worker — so a retried request with the
// same idempotencyKey never double-spends today's allowance even though it's cheap to check
// again.
router.post('/image-optimizer/convert', async (req, res) => {
  const body = convertRequestSchema.parse(req.body);
  const shopDomain = req.shopDomain;

  await assertQuotaAvailable(shopDomain, body.images.length);

  const jobIds = [];
  for (const [index, image] of body.images.entries()) {
    const jobId = crypto.randomUUID();
    const { jobId: claimedJobId } = await claimConversionJobCreation({
      shopDomain,
      idempotencyKey: `${body.idempotencyKey}:${index}`,
      jobId,
      jobData: {
        inputUrl: image.sourceUrl,
        inputFormat: image.inputFormat,
        outputFormats: body.outputFormats,
        quality: body.quality ?? null,
        isAnimatedGif: image.isAnimatedGif,
        replaceInPlace: body.replaceInPlace,
        shopifyProductId: image.productId ?? null,
        shopifyMediaId: image.mediaId ?? null,
      },
    });
    jobIds.push(claimedJobId);
  }

  const batchId = crypto.randomUUID();
  await conversionBatchesRepo.create(batchId, { shopDomain, jobIds });
  await Promise.all(jobIds.map((jobId) => conversionJobsRepo.getRef(jobId).update({ batchId })));
  jobIds.forEach((jobId) => imageOptimizerWorker.enqueue(jobId));

  res.status(201).json({ batchId, jobIds });
});

// GET /api/image-optimizer/batches/:batchId — poll batch + child jobs, same shape as
// GET /api/batches/:batchId, backing the Convert Images progress view.
router.get('/image-optimizer/batches/:batchId', async (req, res) => {
  const batch = await conversionBatchesRepo.getById(req.params.batchId);
  if (!batch || batch.shopDomain !== req.shopDomain) {
    return res.status(404).json({ error: 'Batch not found' });
  }
  const jobs = await Promise.all(batch.jobIds.map((jobId) => conversionJobsRepo.getById(jobId)));
  return res.json({ batch, jobs: jobs.filter(Boolean) });
});

// GET /api/image-optimizer/history — Conversion History page's IndexTable data.
router.get('/image-optimizer/history', async (req, res) => {
  const { limit } = req.query;
  const jobs = await conversionJobsRepo.findByShop(req.shopDomain, { limit: limit ? Number(limit) : undefined });
  res.json({ jobs });
});

// POST /api/image-optimizer/jobs/:jobId/restore — re-adds the never-deleted original Cloudinary
// asset as product media. Only meaningful for a job that actually replaced a product's image.
router.post('/image-optimizer/jobs/:jobId/restore', async (req, res) => {
  const job = await conversionJobsRepo.getById(req.params.jobId);
  if (!job || job.shopDomain !== req.shopDomain) {
    return res.status(404).json({ error: 'Conversion job not found' });
  }
  if (!job.replaceInPlace || !job.shopifyProductId) {
    return res.status(422).json({ error: 'This conversion did not replace a product image — nothing to restore.' });
  }

  try {
    await restoreProductImage({
      shopDomain: req.shopDomain,
      productId: job.shopifyProductId,
      originalImageUrl: job.inputUrl,
    });
  } catch (error) {
    if (error instanceof ShopifyMediaReplaceError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    throw error;
  }

  await conversionJobsRepo.markRestored(req.params.jobId);
  return res.json({ restored: true });
});

// POST /api/image-optimizer/billing/subscribe — the $2.99/mo add-on, independent of the
// generation-credits plan (see /api/billing/purchase and /api/billing/custom-purchase for that).
router.post('/image-optimizer/billing/subscribe', async (req, res) => {
  const returnUrl = `${env.SHOPIFY_APP_URL}/api/image-optimizer/billing/confirm`;
  const confirmationUrl = await createImageOptimizerSubscription({
    session: req.shopSession,
    returnUrl,
    isTest: !isProduction,
  });
  res.json({ confirmationUrl });
});

// GET /api/image-optimizer/billing/confirm — redirect target after the merchant approves/declines
// the add-on subscription. Reuses the same reconcileBillingState() as the credits system's
// confirm route since a shop's full billing state (credits, unlimited, and this add-on) is always
// re-checked together — cheap, and avoids two different "what's actually active now" code paths.
router.get('/image-optimizer/billing/confirm', async (req, res) => {
  const result = await reconcileBillingState({ session: req.shopSession, isTest: !isProduction });
  res.redirect(`${env.SHOPIFY_APP_URL}/image-optimizer/settings?confirmed=${result.imageOptimizerAddon}`);
});

export default router;
