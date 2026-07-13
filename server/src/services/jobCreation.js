import crypto from 'node:crypto';
import { z } from 'zod';
import { jobsRepo } from '../models/jobsRepo.js';
import { assertAdultPersona } from './personaGuard.js';
import { assertSufficientCredits } from './creditLedger.js';
import { claimJobCreation } from './idempotency.js';
import { jobWorker } from './jobWorker.js';
import { isTextToImageModel } from './fal.js';

export const personaSettingsSchema = z.object({
  ageRange: z.string(),
  genderPresentation: z.string(),
  setting: z.string(),
});

// A job is created in exactly one of two modes: template mode (fixed prompt+model, one source
// image, the original spec flow) or custom mode (merchant writes their own prompt and picks an
// admin-allowed model, one or more source images combined as multi-image reference — scene
// content type only, spec decision to ship this narrower first). Never both, never neither.
export const generationInputSchema = z
  .object({
    // Required for template mode (always tied to a real catalog product). Optional for custom
    // mode: Virtual Try-On's garment image can come from an upload with no Shopify product behind
    // it (see VirtualTryOn.jsx) — those jobs simply have nothing to publish back to Shopify later
    // (routes/api/jobs.js's publish endpoint still requires a real productId of its own).
    productId: z.string().min(1).optional(),
    contentType: z.enum(['scene', 'ugc', 'video']),
    personaSettings: personaSettingsSchema.optional(),
    productCategoryTag: z.string().optional(),
    productAttributes: z.object({ color: z.string().optional() }).optional(),
    aspectRatio: z.enum(['9:16', '1:1', '16:9']).optional(),
    reuseCleanImageFromJobId: z.string().optional(),

    // Template mode
    templateId: z.string().min(1).optional(),
    imageUrl: z.string().url().optional(),

    // Custom mode
    modelId: z.string().min(1).optional(),
    customPrompt: z.string().min(1).max(4000).optional(),
    imageUrls: z.array(z.string().url()).min(1).max(6).optional(),

    // Shared by both modes — how many variations to generate. Defaults to 1 if omitted (see
    // createGenerationJob below); cost scales linearly with it either way (creditLedger.js).
    numImages: z.coerce.number().int().min(1).max(4).optional(),
  })
  .superRefine((body, ctx) => {
    const isCustom = Boolean(body.modelId || body.customPrompt || body.imageUrls);
    const isTemplate = Boolean(body.templateId || body.imageUrl);

    if (isCustom && isTemplate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either templateId+imageUrl or modelId+customPrompt+imageUrls, not both.',
      });
      return;
    }
    if (!isCustom && !isTemplate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['templateId'], message: 'templateId is required.' });
      return;
    }

    if (isTemplate && !body.productId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['productId'], message: 'productId is required for template mode.' });
    }

    if (isCustom) {
      if (body.contentType !== 'scene') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['contentType'],
          message: 'Custom-prompt generation is only supported for scene photos.',
        });
      }
      if (!body.modelId) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['modelId'], message: 'modelId is required.' });
      if (!body.customPrompt) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['customPrompt'], message: 'customPrompt is required.' });
      }
      // Text-to-image models (ideogram-v4-text, imagen4-preview, etc.) have no source image at
      // all — verified live to have no image_url/image_urls param in their real fal.ai schema
      // (see fal.js's TEXT_TO_IMAGE_MODELS) — so imageUrls is only required for every other model.
      if (!body.imageUrls && !isTextToImageModel(body.modelId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['imageUrls'], message: 'imageUrls is required.' });
      }
    } else if (!body.imageUrl) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['imageUrl'], message: 'imageUrl is required.' });
    }
  });

// The single path both POST /api/generate and POST /api/generate/bulk (fanned out per product)
// go through — same validation, same server-side credit check, same idempotency claim, same
// admission into the job worker. Bulk generation is not a separate, parallel implementation of
// this logic (spec Section 17: no duplicated pipelines).
export async function createGenerationJob({ shopDomain, input, idempotencyKey, batchId = null }) {
  const body = generationInputSchema.parse(input);
  const isCustom = Boolean(body.modelId);
  const numImages = body.numImages ?? 1;

  if (body.contentType === 'ugc') {
    assertAdultPersona(body.personaSettings);
  }

  await assertSufficientCredits(
    shopDomain,
    isCustom ? { modelId: body.modelId, numImages } : { templateId: body.templateId, numImages },
  );

  let cleanImageUrl = null;
  if (body.reuseCleanImageFromJobId) {
    const sourceJob = await jobsRepo.getById(body.reuseCleanImageFromJobId);
    if (sourceJob && sourceJob.shopDomain === shopDomain && sourceJob.cleanImageUrl) {
      cleanImageUrl = sourceJob.cleanImageUrl;
    }
  }

  const jobId = crypto.randomUUID();
  const { created, jobId: finalJobId } = await claimJobCreation({
    shopDomain,
    idempotencyKey,
    jobId,
    jobData: {
      productId: body.productId ?? null,
      productImageUrl: isCustom ? null : body.imageUrl,
      productImageUrls: isCustom ? body.imageUrls ?? null : null,
      contentType: body.contentType,
      templateId: isCustom ? null : body.templateId,
      modelId: isCustom ? body.modelId : null,
      customPrompt: isCustom ? body.customPrompt : null,
      numImages,
      personaSettings: body.personaSettings ?? null,
      productCategoryTag: body.productCategoryTag ?? null,
      productAttributes: body.productAttributes ?? null,
      aspectRatio: body.aspectRatio ?? null,
      cleanImageUrl,
      batchId,
      modelUsed: null,
    },
  });

  if (created) {
    jobWorker.enqueue(finalJobId, shopDomain);
  }

  return { created, jobId: finalJobId };
}
