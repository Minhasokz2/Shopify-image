import pLimit from 'p-limit';
import { conversionJobsRepo, CONVERSION_STATUS } from '../models/conversionJobsRepo.js';
import { conversionBatchesRepo } from '../models/conversionBatchesRepo.js';
import { convertImage } from './imageConversion.js';
import { recordConversionOutcome } from './imageOptimizerQuota.js';
import { replaceProductImage } from './shopifyMediaReplace.js';
import { logger } from '../lib/logger.js';
import { captureJobFailure } from '../lib/sentry.js';

// Lighter than the generation worker's 20/40 caps (jobWorker.js) — Cloudinary eager transforms
// plus at most one Shopify GraphQL round trip per job, not a multi-minute FAL/OpenAI call.
const CONCURRENCY = 5;
const BACKUP_RETENTION_DAYS = 30;

// In-process, single-Render-instance worker (no Redis/BullMQ — see the architecture note in this
// repo's Image Optimizer feature commit: this app deliberately runs on one Render Web Service
// instance, matching the same constraint jobWorker.js documents for the generation pipeline).
// Structurally mirrors jobWorker.js: fire-and-forget enqueue backed by a durable Firestore record,
// resumable on boot so a redeploy mid-conversion never loses a job.
class ImageOptimizerWorker {
  constructor() {
    this.limiter = pLimit(CONCURRENCY);
  }

  enqueue(conversionJobId) {
    this.limiter(() => this.runConversion(conversionJobId)).catch((error) => {
      logger.error({ conversionJobId, err: error }, 'Unexpected conversion scheduling failure');
    });
  }

  async resumeFromFirestore() {
    const resumable = await conversionJobsRepo.findResumable();
    if (resumable.length > 0) {
      logger.info({ count: resumable.length }, 'Resuming conversion jobs from Firestore after boot');
    }
    for (const job of resumable) {
      this.enqueue(job.id);
    }
  }

  async runConversion(conversionJobId) {
    let job;
    try {
      job = await conversionJobsRepo.getById(conversionJobId);
      if (!job || job.status === CONVERSION_STATUS.DONE) {
        return; // already settled by a previous attempt
      }

      await conversionJobsRepo.markProcessing(conversionJobId);

      const { cloudinaryPublicId, originalBytes, convertedAssets, savedBytes } = await convertImage({
        sourceUrl: job.inputUrl,
        shopDomain: job.shopDomain,
        publicId: `${job.shopDomain}/${conversionJobId}`,
        inputFormat: job.inputFormat,
        outputFormats: job.outputFormats,
        quality: job.quality,
        isAnimatedGif: job.isAnimatedGif,
      });

      if (job.replaceInPlace && job.shopifyProductId) {
        // Product media is a single file — replace-in-place always uses the first requested
        // format (WebP first when "Both" was chosen), even if the merchant also generated the
        // second format for direct download/history purposes.
        const primaryAsset = convertedAssets[0];
        if (primaryAsset) {
          await replaceProductImage({
            shopDomain: job.shopDomain,
            productId: job.shopifyProductId,
            oldMediaId: job.shopifyMediaId,
            newImageUrl: primaryAsset.url,
            replaceInPlace: true,
          });
        }
      }

      const backupExpiry = new Date(Date.now() + BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      await conversionJobsRepo.markDone(conversionJobId, {
        outputAssets: convertedAssets,
        originalBytes,
        savedBytes,
        cloudinaryPublicId,
        backupExpiry,
      });

      await recordConversionOutcome(job.shopDomain, { savedBytes });
      await this.recordBatchOutcome(job.batchId, true);
      logger.info({ conversionJobId, shopDomain: job.shopDomain, savedBytes }, 'Conversion job succeeded');
    } catch (error) {
      logger.error({ conversionJobId, err: error }, 'Conversion job failed');
      captureJobFailure(error, { shopDomain: job?.shopDomain, jobId: conversionJobId });
      await conversionJobsRepo.markFailed(conversionJobId, { errorMessage: error.message });
      await this.recordBatchOutcome(job?.batchId, false);
    }
  }

  async recordBatchOutcome(batchId, succeeded) {
    if (!batchId) return;
    await conversionBatchesRepo.recordJobOutcome(batchId, { succeeded });
    await conversionBatchesRepo.finalizeIfComplete(batchId);
  }
}

export const imageOptimizerWorker = new ImageOptimizerWorker();
export { ImageOptimizerWorker };
