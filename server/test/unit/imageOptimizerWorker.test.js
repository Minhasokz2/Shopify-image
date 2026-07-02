import { describe, it, expect, vi, beforeEach } from 'vitest';

const jobsById = new Map();
const getById = vi.fn(async (id) => jobsById.get(id));
const markProcessing = vi.fn(async () => {});
const markDone = vi.fn(async () => {});
const markFailed = vi.fn(async () => {});

const recordJobOutcome = vi.fn(async () => {});
const finalizeIfComplete = vi.fn(async () => {});

const convertImage = vi.fn(async () => ({
  cloudinaryPublicId: 'shop.myshopify.com/job-1',
  originalBytes: 100000,
  convertedAssets: [{ format: 'webp', url: 'https://cloudinary.example.com/out.webp', bytes: 40000 }],
  savedBytes: 60000,
}));

const recordConversionOutcome = vi.fn(async () => {});
const replaceProductImage = vi.fn(async () => ({ newMediaId: 'gid://shopify/MediaImage/999' }));
const captureJobFailure = vi.fn();

vi.mock('../../src/models/conversionJobsRepo.js', () => ({
  conversionJobsRepo: { getById, markProcessing, markDone, markFailed, findResumable: vi.fn(async () => []) },
  CONVERSION_STATUS: { QUEUED: 'queued', PROCESSING: 'processing', DONE: 'done', FAILED: 'failed', RESTORED: 'restored' },
}));
vi.mock('../../src/models/conversionBatchesRepo.js', () => ({
  conversionBatchesRepo: { recordJobOutcome, finalizeIfComplete },
}));
vi.mock('../../src/services/imageConversion.js', () => ({ convertImage }));
vi.mock('../../src/services/imageOptimizerQuota.js', () => ({ recordConversionOutcome }));
vi.mock('../../src/services/shopifyMediaReplace.js', () => ({ replaceProductImage }));
vi.mock('../../src/lib/sentry.js', () => ({ captureJobFailure }));

const { ImageOptimizerWorker } = await import('../../src/services/imageOptimizerWorker.js');

beforeEach(() => {
  vi.clearAllMocks();
  jobsById.clear();
});

describe('ImageOptimizerWorker.runConversion: success path', () => {
  it('converts, records the outcome, and never touches Shopify when replaceInPlace is false', async () => {
    jobsById.set('job-1', {
      shopDomain: 'shop.myshopify.com',
      status: 'queued',
      inputUrl: 'https://cdn.shopify.com/a.jpg',
      inputFormat: 'jpg',
      outputFormats: ['webp'],
      quality: null,
      isAnimatedGif: false,
      replaceInPlace: false,
      shopifyProductId: null,
      shopifyMediaId: null,
      batchId: 'batch-1',
    });

    const worker = new ImageOptimizerWorker();
    await worker.runConversion('job-1');

    expect(markProcessing).toHaveBeenCalledWith('job-1');
    expect(convertImage).toHaveBeenCalledWith(
      expect.objectContaining({ sourceUrl: 'https://cdn.shopify.com/a.jpg', outputFormats: ['webp'] }),
    );
    expect(replaceProductImage).not.toHaveBeenCalled();
    expect(markDone).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ savedBytes: 60000, originalBytes: 100000, cloudinaryPublicId: 'shop.myshopify.com/job-1' }),
    );
    expect(recordConversionOutcome).toHaveBeenCalledWith('shop.myshopify.com', { savedBytes: 60000 });
    expect(recordJobOutcome).toHaveBeenCalledWith('batch-1', { succeeded: true });
    expect(finalizeIfComplete).toHaveBeenCalledWith('batch-1');
    expect(markFailed).not.toHaveBeenCalled();
  });

  it('replaces the product image using the first converted asset when replaceInPlace is true', async () => {
    convertImage.mockResolvedValueOnce({
      cloudinaryPublicId: 'x',
      originalBytes: 100000,
      convertedAssets: [
        { format: 'webp', url: 'https://cloudinary.example.com/out.webp', bytes: 40000 },
        { format: 'avif', url: 'https://cloudinary.example.com/out.avif', bytes: 30000 },
      ],
      savedBytes: 70000,
    });
    jobsById.set('job-2', {
      shopDomain: 'shop.myshopify.com',
      status: 'queued',
      inputUrl: 'https://cdn.shopify.com/a.jpg',
      inputFormat: 'jpg',
      outputFormats: ['webp', 'avif'],
      replaceInPlace: true,
      shopifyProductId: 'gid://shopify/Product/1',
      shopifyMediaId: 'gid://shopify/MediaImage/1',
      batchId: null,
    });

    const worker = new ImageOptimizerWorker();
    await worker.runConversion('job-2');

    expect(replaceProductImage).toHaveBeenCalledWith({
      shopDomain: 'shop.myshopify.com',
      productId: 'gid://shopify/Product/1',
      oldMediaId: 'gid://shopify/MediaImage/1',
      newImageUrl: 'https://cloudinary.example.com/out.webp',
      replaceInPlace: true,
    });
  });
});

describe('ImageOptimizerWorker.runConversion: failure path', () => {
  it('marks the job failed and never records a quota outcome when conversion throws', async () => {
    convertImage.mockRejectedValueOnce(new Error('Cloudinary upload failed'));
    jobsById.set('job-3', {
      shopDomain: 'shop.myshopify.com',
      status: 'queued',
      inputUrl: 'https://cdn.shopify.com/a.jpg',
      inputFormat: 'jpg',
      outputFormats: ['webp'],
      replaceInPlace: false,
      batchId: 'batch-2',
    });

    const worker = new ImageOptimizerWorker();
    await worker.runConversion('job-3');

    expect(markFailed).toHaveBeenCalledWith('job-3', { errorMessage: 'Cloudinary upload failed' });
    expect(recordConversionOutcome).not.toHaveBeenCalled();
    expect(captureJobFailure).toHaveBeenCalled();
    expect(recordJobOutcome).toHaveBeenCalledWith('batch-2', { succeeded: false });
  });

  it('marks the job failed if the Shopify replace step itself throws after a successful conversion', async () => {
    replaceProductImage.mockRejectedValueOnce(new Error('No offline session found'));
    jobsById.set('job-4', {
      shopDomain: 'shop.myshopify.com',
      status: 'queued',
      inputUrl: 'https://cdn.shopify.com/a.jpg',
      inputFormat: 'jpg',
      outputFormats: ['webp'],
      replaceInPlace: true,
      shopifyProductId: 'gid://shopify/Product/1',
      shopifyMediaId: 'gid://shopify/MediaImage/1',
      batchId: null,
    });

    const worker = new ImageOptimizerWorker();
    await worker.runConversion('job-4');

    expect(markFailed).toHaveBeenCalledWith('job-4', { errorMessage: 'No offline session found' });
    expect(markDone).not.toHaveBeenCalled();
    expect(recordConversionOutcome).not.toHaveBeenCalled();
  });
});

describe('ImageOptimizerWorker.runConversion: idempotent resume', () => {
  it('is a no-op for a job that is missing or already done', async () => {
    jobsById.set('already-done', { status: 'done', shopDomain: 'shop.myshopify.com' });
    const worker = new ImageOptimizerWorker();

    await worker.runConversion('already-done');
    await worker.runConversion('missing-job');

    expect(markProcessing).not.toHaveBeenCalled();
    expect(convertImage).not.toHaveBeenCalled();
  });
});
