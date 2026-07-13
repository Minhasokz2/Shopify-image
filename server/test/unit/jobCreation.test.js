import { describe, it, expect, vi, beforeEach } from 'vitest';

const assertAdultPersona = vi.fn();
const assertSufficientCredits = vi.fn(async () => ({ creditCost: 4 }));
const claimJobCreation = vi.fn(async ({ jobId }) => ({ created: true, jobId }));
const jobWorkerEnqueue = vi.fn();
const jobsRepoGetById = vi.fn(async () => null);

vi.mock('../../src/services/personaGuard.js', () => ({ assertAdultPersona }));
vi.mock('../../src/services/creditLedger.js', () => ({ assertSufficientCredits }));
vi.mock('../../src/services/idempotency.js', () => ({ claimJobCreation }));
vi.mock('../../src/services/jobWorker.js', () => ({ jobWorker: { enqueue: jobWorkerEnqueue } }));
vi.mock('../../src/models/jobsRepo.js', () => ({ jobsRepo: { getById: jobsRepoGetById } }));

const { createGenerationJob, generationInputSchema } = await import('../../src/services/jobCreation.js');

beforeEach(() => {
  vi.clearAllMocks();
  claimJobCreation.mockImplementation(async ({ jobId }) => ({ created: true, jobId }));
});

describe('generationInputSchema: template vs custom mode', () => {
  it('accepts a valid template-mode payload', () => {
    const result = generationInputSchema.safeParse({
      productId: 'p1',
      contentType: 'scene',
      templateId: 'studio-white',
      imageUrl: 'https://shop.example.com/a.png',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid custom-mode payload with multiple images', () => {
    const result = generationInputSchema.safeParse({
      productId: 'p1',
      contentType: 'scene',
      modelId: 'flux-kontext-max',
      customPrompt: 'Combine these two products on a marble table',
      imageUrls: ['https://shop.example.com/a.png', 'https://shop.example.com/b.png'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a payload mixing template and custom fields', () => {
    const result = generationInputSchema.safeParse({
      productId: 'p1',
      contentType: 'scene',
      templateId: 'studio-white',
      modelId: 'flux-kontext-max',
      customPrompt: 'A prompt',
      imageUrls: ['https://shop.example.com/a.png'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a payload with neither template nor custom fields', () => {
    const result = generationInputSchema.safeParse({ productId: 'p1', contentType: 'scene' });
    expect(result.success).toBe(false);
  });

  it('rejects custom mode for a non-scene content type', () => {
    const result = generationInputSchema.safeParse({
      productId: 'p1',
      contentType: 'video',
      modelId: 'flux-kontext-max',
      customPrompt: 'A prompt',
      imageUrls: ['https://shop.example.com/a.png'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects custom mode missing customPrompt', () => {
    const result = generationInputSchema.safeParse({
      productId: 'p1',
      contentType: 'scene',
      modelId: 'flux-kontext-max',
      imageUrls: ['https://shop.example.com/a.png'],
    });
    expect(result.success).toBe(false);
  });

  // Virtual Try-On's garment image can come from an upload with no Shopify product behind it
  // (see web/src/pages/VirtualTryOn.jsx) — that job just has nothing to publish back to Shopify
  // later, which is fine; it shouldn't block job creation itself.
  it('accepts custom mode with no productId', () => {
    const result = generationInputSchema.safeParse({
      contentType: 'scene',
      modelId: 'fashn-tryon',
      customPrompt: 'Fit the garment onto the person exactly as shown.',
      imageUrls: ['https://shop.example.com/person.png', 'https://shop.example.com/garment.png'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects template mode with no productId', () => {
    const result = generationInputSchema.safeParse({
      contentType: 'scene',
      templateId: 'studio-white',
      imageUrl: 'https://shop.example.com/a.png',
    });
    expect(result.success).toBe(false);
  });
});

describe('createGenerationJob: custom mode', () => {
  it('checks credits against the modelId, not a templateId, and stores customPrompt/imageUrls on the job', async () => {
    await createGenerationJob({
      shopDomain: 'shop.myshopify.com',
      idempotencyKey: 'key-1',
      input: {
        productId: 'p1',
        contentType: 'scene',
        modelId: 'flux-kontext-max',
        customPrompt: 'A custom scene',
        imageUrls: ['https://shop.example.com/a.png', 'https://shop.example.com/b.png'],
      },
    });

    expect(assertSufficientCredits).toHaveBeenCalledWith('shop.myshopify.com', { modelId: 'flux-kontext-max', numImages: 1 });
    expect(claimJobCreation).toHaveBeenCalledWith(
      expect.objectContaining({
        jobData: expect.objectContaining({
          templateId: null,
          modelId: 'flux-kontext-max',
          customPrompt: 'A custom scene',
          productImageUrl: null,
          productImageUrls: ['https://shop.example.com/a.png', 'https://shop.example.com/b.png'],
        }),
      }),
    );
    expect(jobWorkerEnqueue).toHaveBeenCalled();
  });

  it('stores productId as null when omitted (e.g. an uploaded Virtual Try-On garment)', async () => {
    await createGenerationJob({
      shopDomain: 'shop.myshopify.com',
      idempotencyKey: 'key-1',
      input: {
        contentType: 'scene',
        modelId: 'fashn-tryon',
        customPrompt: 'Fit the garment onto the person exactly as shown.',
        imageUrls: ['https://shop.example.com/person.png', 'https://shop.example.com/garment.png'],
      },
    });

    expect(claimJobCreation).toHaveBeenCalledWith(
      expect.objectContaining({
        jobData: expect.objectContaining({ productId: null }),
      }),
    );
  });

  it('threads an explicit numImages through to the credit check and the stored job', async () => {
    await createGenerationJob({
      shopDomain: 'shop.myshopify.com',
      idempotencyKey: 'key-3',
      input: {
        productId: 'p1',
        contentType: 'scene',
        modelId: 'flux-kontext-max',
        customPrompt: 'A custom scene',
        imageUrls: ['https://shop.example.com/a.png'],
        numImages: 3,
      },
    });

    expect(assertSufficientCredits).toHaveBeenCalledWith('shop.myshopify.com', { modelId: 'flux-kontext-max', numImages: 3 });
    expect(claimJobCreation).toHaveBeenCalledWith(
      expect.objectContaining({
        jobData: expect.objectContaining({ numImages: 3 }),
      }),
    );
  });

  it('checks credits against the templateId for a template-mode job, leaving modelId/customPrompt null', async () => {
    await createGenerationJob({
      shopDomain: 'shop.myshopify.com',
      idempotencyKey: 'key-2',
      input: {
        productId: 'p1',
        contentType: 'scene',
        templateId: 'studio-white',
        imageUrl: 'https://shop.example.com/a.png',
      },
    });

    expect(assertSufficientCredits).toHaveBeenCalledWith('shop.myshopify.com', { templateId: 'studio-white', numImages: 1 });
    expect(claimJobCreation).toHaveBeenCalledWith(
      expect.objectContaining({
        jobData: expect.objectContaining({
          templateId: 'studio-white',
          modelId: null,
          customPrompt: null,
          productImageUrl: 'https://shop.example.com/a.png',
          productImageUrls: null,
        }),
      }),
    );
  });

  it('accepts a text-to-image model with no imageUrls at all — no source image, no product', async () => {
    await createGenerationJob({
      shopDomain: 'shop.myshopify.com',
      idempotencyKey: 'key-text-only',
      input: {
        contentType: 'scene',
        modelId: 'ideogram-v4-text',
        customPrompt: 'A minimalist poster with bold typography',
      },
    });

    expect(assertSufficientCredits).toHaveBeenCalledWith('shop.myshopify.com', { modelId: 'ideogram-v4-text', numImages: 1 });
    expect(claimJobCreation).toHaveBeenCalledWith(
      expect.objectContaining({
        jobData: expect.objectContaining({
          modelId: 'ideogram-v4-text',
          customPrompt: 'A minimalist poster with bold typography',
          productImageUrls: null,
          productId: null,
        }),
      }),
    );
  });

  it('still rejects a non-text-to-image custom model with no imageUrls', async () => {
    await expect(
      createGenerationJob({
        shopDomain: 'shop.myshopify.com',
        idempotencyKey: 'key-missing-images',
        input: {
          contentType: 'scene',
          modelId: 'flux-kontext-max',
          customPrompt: 'A prompt with no images attached',
        },
      }),
    ).rejects.toThrow(/imageUrls/);
  });
});
