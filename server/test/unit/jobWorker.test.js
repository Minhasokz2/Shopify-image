import { describe, it, expect, vi, beforeEach } from 'vitest';

const jobsById = new Map();
const getById = vi.fn(async (id) => jobsById.get(id));
const markProcessing = vi.fn(async () => {});
const updateProgressStage = vi.fn(async () => {});
const getRefUpdate = vi.fn(async () => {});
const getRef = vi.fn(() => ({ update: getRefUpdate }));

const templatesById = new Map();
const templatesGetById = vi.fn(async (id) => templatesById.get(id));

const recordJobOutcome = vi.fn(async () => {});
const finalizeIfComplete = vi.fn(async () => {});

const executeGeneration = vi.fn(async () => ({
  model: 'flux-kontext-max',
  cleanImageUrl: 'https://r2.example.com/clean.png',
  variationUrls: ['https://fal.example.com/1.png'],
}));

const settleJobSuccess = vi.fn(async () => ({ alreadyCharged: false, creditsCharged: 4 }));
const settleJobFailure = vi.fn(async () => {});
const persistMediaToCloudinary = vi.fn(async (url) => `https://res.cloudinary.com/${url.split('/').pop()}`);
const captureJobFailure = vi.fn();

vi.mock('../../src/models/jobsRepo.js', () => ({
  jobsRepo: { getById, markProcessing, getRef, updateProgressStage, findResumable: vi.fn(async () => []) },
  JOB_STATUS: { PENDING: 'pending', PROCESSING: 'processing', SUCCEEDED: 'succeeded', FAILED: 'failed' },
}));
vi.mock('../../src/models/batchesRepo.js', () => ({ batchesRepo: { recordJobOutcome, finalizeIfComplete } }));
vi.mock('../../src/models/templatesRepo.js', () => ({ templatesRepo: { getById: templatesGetById } }));
vi.mock('../../src/models/shopsRepo.js', () => ({ shopsRepo: { getByDomain: vi.fn(async () => ({ brandStyleProfile: null })) } }));
vi.mock('../../src/services/modelRouter.js', () => ({ executeGeneration }));
vi.mock('../../src/services/creditLedger.js', () => ({ settleJobSuccess, settleJobFailure }));
vi.mock('../../src/lib/cloudinary.js', () => ({ persistMediaToCloudinary }));
vi.mock('../../src/lib/sentry.js', () => ({ captureJobFailure }));

const { JobWorker, PER_SHOP_CONCURRENCY } = await import('../../src/services/jobWorker.js');

beforeEach(() => {
  vi.clearAllMocks();
  jobsById.clear();
  templatesById.set('t1', { promptTemplate: 'a prompt', preferredModel: 'flux-kontext-max', creditCost: 4 });
});

describe('JobWorker: admission control', () => {
  it('canAcceptJob is true below the per-shop cap and false at/above it', () => {
    const worker = new JobWorker();
    for (let i = 0; i < PER_SHOP_CONCURRENCY; i += 1) {
      expect(worker.canAcceptJob('shop.myshopify.com')).toBe(true);
      worker.trackStart('shop.myshopify.com');
    }
    expect(worker.canAcceptJob('shop.myshopify.com')).toBe(false);
  });

  it('trackEnd frees a slot', () => {
    const worker = new JobWorker();
    worker.trackStart('shop.myshopify.com');
    worker.trackStart('shop.myshopify.com');
    worker.trackEnd('shop.myshopify.com');
    expect(worker.getActiveCount('shop.myshopify.com')).toBe(1);
  });

  it('tracks each shop independently', () => {
    const worker = new JobWorker();
    worker.trackStart('shop-a.myshopify.com');
    expect(worker.canAcceptJob('shop-b.myshopify.com')).toBe(true);
    expect(worker.getActiveCount('shop-b.myshopify.com')).toBe(0);
  });
});

describe('JobWorker: enqueue concurrency limiting', () => {
  it('never runs more than 20 concurrent generations for a single shop', async () => {
    let current = 0;
    let maxObserved = 0;
    executeGeneration.mockImplementation(async () => {
      current += 1;
      maxObserved = Math.max(maxObserved, current);
      await new Promise((resolve) => setTimeout(resolve, 15));
      current -= 1;
      return { model: 'flux-kontext-max', cleanImageUrl: 'clean', variationUrls: ['v1'] };
    });

    const worker = new JobWorker();
    const shop = 'busy-shop.myshopify.com';
    const jobCount = 25;
    for (let i = 0; i < jobCount; i += 1) {
      const jobId = `job-${i}`;
      jobsById.set(jobId, { status: 'pending', shopDomain: shop, contentType: 'scene', templateId: 't1', productImageUrl: 'x' });
      worker.enqueue(jobId, shop);
    }

    await vi.waitFor(() => expect(settleJobSuccess).toHaveBeenCalledTimes(jobCount), { timeout: 5000 });
    expect(maxObserved).toBeLessThanOrEqual(PER_SHOP_CONCURRENCY);
    expect(worker.getActiveCount(shop)).toBe(0);
  });

  it("a second shop's jobs are not blocked by the first shop's full limiter", async () => {
    let releaseBusy;
    const busyGate = new Promise((resolve) => {
      releaseBusy = resolve;
    });
    executeGeneration.mockImplementation(async ({ sourceImageUrl }) => {
      if (sourceImageUrl === 'busy-product') {
        await busyGate; // deliberately never resolves until the test releases it
      }
      return { model: 'flux-kontext-max', cleanImageUrl: 'clean', variationUrls: ['v1'] };
    });

    const worker = new JobWorker();
    const busyShop = 'busy-shop2.myshopify.com';
    const quietShop = 'quiet-shop.myshopify.com';

    for (let i = 0; i < PER_SHOP_CONCURRENCY; i += 1) {
      const jobId = `busy-job-${i}`;
      jobsById.set(jobId, {
        status: 'pending',
        shopDomain: busyShop,
        contentType: 'scene',
        templateId: 't1',
        productImageUrl: 'busy-product',
      });
      worker.enqueue(jobId, busyShop);
    }
    jobsById.set('quiet-job', {
      status: 'pending',
      shopDomain: quietShop,
      contentType: 'scene',
      templateId: 't1',
      productImageUrl: 'quiet-product',
    });
    worker.enqueue('quiet-job', quietShop);

    // The quiet shop's job completes even though every busy-shop slot is permanently stuck —
    // proving it runs on an independent limiter rather than queuing behind the busy shop.
    await vi.waitFor(() => expect(worker.getActiveCount(quietShop)).toBe(0), { timeout: 1000 });
    expect(worker.getActiveCount(busyShop)).toBe(PER_SHOP_CONCURRENCY);

    releaseBusy();
    await vi.waitFor(() => expect(worker.getActiveCount(busyShop)).toBe(0), { timeout: 1000 });
  });
});

describe('JobWorker: runJob success/failure settlement', () => {
  it('marks processing, generates, persists variations to Cloudinary, and settles success', async () => {
    executeGeneration.mockResolvedValue({
      model: 'flux-kontext-max',
      cleanImageUrl: 'https://fal.example.com/clean.png',
      variationUrls: ['https://fal.example.com/a.png', 'https://fal.example.com/b.png'],
    });
    jobsById.set('job-ok', {
      status: 'pending',
      shopDomain: 'shop.myshopify.com',
      contentType: 'scene',
      templateId: 't1',
      productImageUrl: 'https://shop.example.com/raw.png',
      batchId: null,
    });

    const worker = new JobWorker();
    await worker.runJob('job-ok', 'shop.myshopify.com');

    expect(markProcessing).toHaveBeenCalledWith('job-ok');
    expect(persistMediaToCloudinary).toHaveBeenCalledTimes(2);
    expect(settleJobSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'job-ok',
        modelUsed: 'flux-kontext-max',
        variations: [
          expect.objectContaining({ approved: false, publishedToShopify: false }),
          expect.objectContaining({ approved: false, publishedToShopify: false }),
        ],
      }),
    );
    expect(settleJobFailure).not.toHaveBeenCalled();
    expect(worker.getActiveCount('shop.myshopify.com')).toBe(0);
  });

  it('reports the uploading_results stage after generation returns and before Cloudinary persistence settles', async () => {
    executeGeneration.mockResolvedValue({
      model: 'flux-kontext-max',
      cleanImageUrl: 'https://fal.example.com/clean.png',
      variationUrls: ['https://fal.example.com/a.png'],
    });
    jobsById.set('job-stage', {
      status: 'pending',
      shopDomain: 'shop.myshopify.com',
      contentType: 'scene',
      templateId: 't1',
      productImageUrl: 'https://shop.example.com/raw.png',
      batchId: null,
    });

    const worker = new JobWorker();
    await worker.runJob('job-stage', 'shop.myshopify.com');

    // executeGeneration itself reports removing_background/generating (see modelRouter.test.js) —
    // this asserts the worker's own final stage transition, which happens outside that call.
    expect(updateProgressStage).toHaveBeenCalledWith('job-stage', 'uploading_results');
  });

  it('a failed progress-stage write never fails the job itself', async () => {
    updateProgressStage.mockRejectedValueOnce(new Error('Firestore transiently unreachable'));
    executeGeneration.mockResolvedValue({
      model: 'flux-kontext-max',
      cleanImageUrl: 'https://fal.example.com/clean.png',
      variationUrls: ['https://fal.example.com/a.png'],
    });
    jobsById.set('job-stage-fail', {
      status: 'pending',
      shopDomain: 'shop.myshopify.com',
      contentType: 'scene',
      templateId: 't1',
      productImageUrl: 'https://shop.example.com/raw.png',
      batchId: null,
    });

    const worker = new JobWorker();
    await worker.runJob('job-stage-fail', 'shop.myshopify.com');

    expect(settleJobSuccess).toHaveBeenCalled();
    expect(settleJobFailure).not.toHaveBeenCalled();
  });

  it('settles failure and never charges credits when generation throws', async () => {
    executeGeneration.mockRejectedValue(new Error('model API timed out'));
    jobsById.set('job-fail', {
      status: 'pending',
      shopDomain: 'shop.myshopify.com',
      contentType: 'scene',
      templateId: 't1',
      productImageUrl: 'https://shop.example.com/raw.png',
      batchId: 'batch-1',
    });

    const worker = new JobWorker();
    await worker.runJob('job-fail', 'shop.myshopify.com');

    expect(settleJobFailure).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-fail' }));
    expect(settleJobSuccess).not.toHaveBeenCalled();
    expect(captureJobFailure).toHaveBeenCalled();
    expect(recordJobOutcome).toHaveBeenCalledWith('batch-1', { succeeded: false });
    expect(finalizeIfComplete).toHaveBeenCalledWith('batch-1');
  });

  it('is a no-op for a job that is missing or already succeeded (idempotent resume)', async () => {
    jobsById.set('already-done', { status: 'succeeded', shopDomain: 'shop.myshopify.com' });
    const worker = new JobWorker();

    await worker.runJob('already-done', 'shop.myshopify.com');
    await worker.runJob('missing-job', 'shop.myshopify.com');

    expect(markProcessing).not.toHaveBeenCalled();
    expect(executeGeneration).not.toHaveBeenCalled();
  });
});
