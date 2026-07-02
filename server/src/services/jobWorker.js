import pLimit from 'p-limit';
import { jobsRepo, JOB_STATUS } from '../models/jobsRepo.js';
import { batchesRepo } from '../models/batchesRepo.js';
import { templatesRepo } from '../models/templatesRepo.js';
import { shopsRepo } from '../models/shopsRepo.js';
import { executeGeneration, executeCustomGeneration } from './modelRouter.js';
import { settleJobSuccess, settleJobFailure } from './creditLedger.js';
import { persistMediaToCloudinary } from '../lib/cloudinary.js';
import { logger } from '../lib/logger.js';
import { captureJobFailure } from '../lib/sentry.js';

const PER_SHOP_CONCURRENCY = 20; // spec Section 13: max 20 concurrent jobs per shop
const GLOBAL_CONCURRENCY = 40; // separate cap protecting aggregate outbound provider call volume

// No Redis/BullMQ on this deployment target (Render, single instance) — this is a single
// in-process, concurrency-limited worker backed by Firestore as the durable job record.
// `activeCounts` is the authoritative, in-memory admission-control signal (spec: reject new
// jobs past the per-shop cap rather than queuing them unboundedly); `shopLimiters`/
// `globalLimiter` separately cap actual concurrent *execution* of the generation pipeline.
class JobWorker {
  constructor() {
    this.shopLimiters = new Map();
    this.globalLimiter = pLimit(GLOBAL_CONCURRENCY);
    this.activeCounts = new Map();
  }

  getShopLimiter(shopDomain) {
    if (!this.shopLimiters.has(shopDomain)) {
      this.shopLimiters.set(shopDomain, pLimit(PER_SHOP_CONCURRENCY));
    }
    return this.shopLimiters.get(shopDomain);
  }

  getActiveCount(shopDomain) {
    return this.activeCounts.get(shopDomain) ?? 0;
  }

  // Checked by the route layer BEFORE claiming an idempotency key / creating a job doc.
  canAcceptJob(shopDomain) {
    return this.getActiveCount(shopDomain) < PER_SHOP_CONCURRENCY;
  }

  trackStart(shopDomain) {
    this.activeCounts.set(shopDomain, this.getActiveCount(shopDomain) + 1);
  }

  trackEnd(shopDomain) {
    const next = Math.max(0, this.getActiveCount(shopDomain) - 1);
    if (next === 0) this.activeCounts.delete(shopDomain);
    else this.activeCounts.set(shopDomain, next);
  }

  // Fast path: called synchronously right after a job doc is created, in the same request.
  // Scheduling happens in-memory, not via a Firestore poll loop.
  enqueue(jobId, shopDomain) {
    this.trackStart(shopDomain);
    const limiter = this.getShopLimiter(shopDomain);
    this.globalLimiter(() => limiter(() => this.runJob(jobId, shopDomain))).catch((error) => {
      // runJob catches its own errors — this only guards against a scheduling-level failure.
      logger.error({ jobId, shopDomain, err: error }, 'Unexpected job scheduling failure');
    });
  }

  // Fallback path: on boot, re-enqueue anything left `pending`/`processing` by a killed or
  // redeployed process. Safe to re-run — generation has no side effects until settleJobSuccess
  // commits, which is itself idempotent.
  async resumeFromFirestore() {
    const resumable = await jobsRepo.findResumable();
    if (resumable.length > 0) {
      logger.info({ count: resumable.length }, 'Resuming jobs from Firestore after boot');
    }
    for (const job of resumable) {
      this.enqueue(job.id, job.shopDomain);
    }
  }

  async runJob(jobId, shopDomain) {
    let job;
    try {
      job = await jobsRepo.getById(jobId);
      if (!job || job.status === JOB_STATUS.SUCCEEDED) {
        return; // nothing to do — already settled by a previous attempt
      }

      await jobsRepo.markProcessing(jobId);

      // Best-effort — a failed progress-stage write must never fail the generation itself, so
      // errors are swallowed rather than propagated or awaited by callers that don't need to.
      const onStage = (stage) => jobsRepo.updateProgressStage(jobId, stage).catch(() => {});
      const { model, variationUrls } = job.modelId
        ? await this.runCustomGeneration(job, onStage)
        : await this.runTemplateGeneration(job, shopDomain, onStage);

      await onStage('uploading_results');

      // Cloudinary derives the delivery format from the uploaded content itself — no file
      // extension belongs on a public_id the way it did on an R2 object key.
      const variations = await Promise.all(
        variationUrls.map(async (url, index) => ({
          url: await persistMediaToCloudinary(url, `generated/${shopDomain}/${jobId}/${index}`),
          approved: false,
          publishedToShopify: false,
        })),
      );

      const { creditsCharged } = await settleJobSuccess({
        jobId,
        shopDomain,
        templateId: job.templateId ?? undefined,
        modelId: job.modelId ?? undefined,
        variations,
        modelUsed: model,
      });

      await this.recordBatchOutcome(job.batchId, true);
      logger.info({ jobId, shopDomain, creditsCharged }, 'Job succeeded');
    } catch (error) {
      logger.error({ jobId, shopDomain, err: error }, 'Job failed');
      captureJobFailure(error, { shopDomain, jobId });
      await settleJobFailure({ jobId, errorMessage: error.message });
      await this.recordBatchOutcome(job?.batchId, false);
    } finally {
      this.trackEnd(shopDomain);
    }
  }

  // Fixed-prompt path: template supplies the model, prompt, and (via reuseCleanImageFromJobId)
  // the option to skip a redundant background-removal pass.
  async runTemplateGeneration(job, shopDomain, onStage) {
    const [template, shop] = await Promise.all([
      templatesRepo.getById(job.templateId),
      shopsRepo.getByDomain(shopDomain),
    ]);
    if (!template) {
      throw new Error(`Job ${job.id} references unknown templateId: ${job.templateId}`);
    }

    const { model, cleanImageUrl, variationUrls } = await executeGeneration({
      contentType: job.contentType,
      productCategoryTag: job.productCategoryTag,
      templateId: job.templateId,
      templates: { [job.templateId]: template },
      sourceImageUrl: job.productImageUrl,
      cleanImageUrl: job.cleanImageUrl || undefined,
      promptTemplate: template.promptTemplate,
      productAttributes: job.productAttributes,
      personaSettings: job.personaSettings,
      brandStyleProfile: shop?.brandStyleProfile ?? null,
      motionPrompt: template.promptTemplate,
      aspectRatio: job.aspectRatio,
      onStage,
    });

    // Persist the background-removed intermediate so a later job (e.g. a video generated from
    // the same product) can reuse it via `reuseCleanImageFromJobId` without re-running birefnet.
    if (!job.cleanImageUrl) {
      await jobsRepo.getRef(job.id).update({ cleanImageUrl });
    }

    return { model, variationUrls };
  }

  // Custom-prompt path: merchant supplies their own prompt and picked one of the admin's
  // allowed models directly — no template, no reuseCleanImageFromJobId optimization (there's no
  // single "the" clean image once multiple source images are combined as reference).
  async runCustomGeneration(job, onStage) {
    return executeCustomGeneration({
      model: job.modelId,
      sourceImageUrls: job.productImageUrls,
      customPrompt: job.customPrompt,
      numImages: job.numImages ?? 1,
      onStage,
    });
  }

  async recordBatchOutcome(batchId, succeeded) {
    if (!batchId) return;
    await batchesRepo.recordJobOutcome(batchId, { succeeded });
    await batchesRepo.finalizeIfComplete(batchId);
  }
}

export const jobWorker = new JobWorker();
export { JobWorker, PER_SHOP_CONCURRENCY, GLOBAL_CONCURRENCY };
