import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { batchesRepo } from '../../models/batchesRepo.js';
import { jobsRepo } from '../../models/jobsRepo.js';
import { publishJobToShopify } from '../../services/publish.js';
import { createGenerationJob, generationInputSchema } from '../../services/jobCreation.js';
import { sendBatchCompleteEmail } from '../../services/email.js';
import { shopify } from '../../config/shopify.js';

const router = Router();

const bulkRequestSchema = z.object({
  idempotencyKey: z.string().min(1),
  templateId: z.string().min(1),
  contentType: z.enum(['scene', 'ugc', 'video']),
  personaSettings: generationInputSchema.shape.personaSettings,
  aspectRatio: generationInputSchema.shape.aspectRatio,
  products: z
    .array(
      z.object({
        productId: z.string().min(1),
        imageUrl: z.string().url(),
        productCategoryTag: z.string().optional(),
        productAttributes: z.object({ color: z.string().optional() }).optional(),
      }),
    )
    .min(1),
});

// POST /api/generate/bulk — fans out into one job per product, sharing the same template/content
// type/persona. Deliberately NOT gated by the per-request 20-concurrent-job admission check that
// guards POST /api/generate: a bulk batch is expected to legitimately exceed that number and
// queue behind the job worker's per-shop concurrency limiter rather than being rejected outright.
router.post('/generate/bulk', async (req, res) => {
  const body = bulkRequestSchema.parse(req.body);
  const shopDomain = req.shopDomain;

  const jobIds = [];
  for (const product of body.products) {
    // Per-product idempotency key, derived from the batch key, so a retried bulk request never
    // double-generates or double-charges any individual product even without a batch-level claim.
    const { jobId } = await createGenerationJob({
      shopDomain,
      idempotencyKey: `${body.idempotencyKey}:${product.productId}`,
      input: {
        productId: product.productId,
        imageUrl: product.imageUrl,
        contentType: body.contentType,
        templateId: body.templateId,
        personaSettings: body.personaSettings,
        productCategoryTag: product.productCategoryTag,
        productAttributes: product.productAttributes,
        aspectRatio: body.aspectRatio,
      },
      // batchId is attached after the batch doc exists — see the update loop below.
    });
    jobIds.push(jobId);
  }

  const batchId = crypto.randomUUID();
  await batchesRepo.create(batchId, { shopDomain, jobIds });
  await Promise.all(jobIds.map((jobId) => jobsRepo.getRef(jobId).update({ batchId })));

  res.status(201).json({ batchId, jobIds });
});

// GET /api/batches/:batchId — poll batch status + all child jobs.
router.get('/batches/:batchId', async (req, res) => {
  const batch = await batchesRepo.getById(req.params.batchId);
  if (!batch || batch.shopDomain !== req.shopDomain) {
    return res.status(404).json({ error: 'Batch not found' });
  }
  const jobs = await Promise.all(batch.jobIds.map((jobId) => jobsRepo.getById(jobId)));

  // Fire the batch-complete email exactly once, the first time a poll observes completion —
  // simpler than a dedicated completion-event mechanism, and idempotent via emailSentAt.
  if (batch.status !== 'processing' && !batch.emailSentAt) {
    const email = await resolveShopEmail(req.shopSession);
    if (email) {
      await sendBatchCompleteEmail({
        to: email,
        batchId: req.params.batchId,
        totalCount: batch.totalCount,
        completedCount: batch.completedCount,
        failedCount: batch.failedCount,
      });
    }
    await batchesRepo.collection().doc(req.params.batchId).update({ emailSentAt: new Date() });
  }

  return res.json({ batch, jobs: jobs.filter(Boolean) });
});

// POST /api/batches/:batchId/publish — bulk publish every approved-and-unpublished job in a batch.
router.post('/batches/:batchId/publish', async (req, res) => {
  const { productIdsByJobId } = z.object({ productIdsByJobId: z.record(z.string(), z.string()) }).parse(req.body);
  const batch = await batchesRepo.getById(req.params.batchId);
  if (!batch || batch.shopDomain !== req.shopDomain) {
    return res.status(404).json({ error: 'Batch not found' });
  }

  const results = await Promise.all(
    batch.jobIds
      .filter((jobId) => productIdsByJobId[jobId])
      .map(async (jobId) => {
        try {
          const result = await publishJobToShopify({
            session: req.shopSession,
            jobId,
            productId: productIdsByJobId[jobId],
          });
          return { jobId, ...result };
        } catch (error) {
          return { jobId, error: error.message };
        }
      }),
  );

  res.json({ results });
});

async function resolveShopEmail(session) {
  try {
    const client = new shopify.api.clients.Graphql({ session });
    const response = await client.request(`#graphql
      query shopEmail { shop { email } }
    `);
    return response.data?.shop?.email ?? null;
  } catch {
    return null;
  }
}

export default router;
