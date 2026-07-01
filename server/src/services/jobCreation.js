import crypto from 'node:crypto';
import { z } from 'zod';
import { jobsRepo } from '../models/jobsRepo.js';
import { assertAdultPersona } from './personaGuard.js';
import { assertSufficientCredits } from './creditLedger.js';
import { claimJobCreation } from './idempotency.js';
import { jobWorker } from './jobWorker.js';

export const personaSettingsSchema = z.object({
  ageRange: z.string(),
  genderPresentation: z.string(),
  setting: z.string(),
});

export const generationInputSchema = z.object({
  productId: z.string().min(1),
  imageUrl: z.string().url(),
  contentType: z.enum(['scene', 'ugc', 'video']),
  templateId: z.string().min(1),
  personaSettings: personaSettingsSchema.optional(),
  productCategoryTag: z.string().optional(),
  productAttributes: z.object({ color: z.string().optional() }).optional(),
  aspectRatio: z.enum(['9:16', '1:1', '16:9']).optional(),
  reuseCleanImageFromJobId: z.string().optional(),
});

// The single path both POST /api/generate and POST /api/generate/bulk (fanned out per product)
// go through — same validation, same server-side credit check, same idempotency claim, same
// admission into the job worker. Bulk generation is not a separate, parallel implementation of
// this logic (spec Section 17: no duplicated pipelines).
export async function createGenerationJob({ shopDomain, input, idempotencyKey, batchId = null }) {
  const body = generationInputSchema.parse(input);

  if (body.contentType === 'ugc') {
    assertAdultPersona(body.personaSettings);
  }

  await assertSufficientCredits(shopDomain, body.templateId);

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
      productId: body.productId,
      productImageUrl: body.imageUrl,
      contentType: body.contentType,
      templateId: body.templateId,
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
