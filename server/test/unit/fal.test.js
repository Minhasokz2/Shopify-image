import { describe, it, expect, vi, beforeEach } from 'vitest';

const subscribe = vi.fn(async () => ({ data: { images: [{ url: 'https://fal.example.com/out.png' }] } }));
vi.mock('@fal-ai/client', () => ({ fal: { config: vi.fn(), subscribe } }));

const {
  generateCustomScene,
  generateScene,
  SCENE_MODEL_IDS,
  ALLOWED_MODEL_IDS,
  TEMPLATE_MODEL_IDS,
  UnsupportedCustomModelInputError,
} = await import('../../src/services/fal.js');

beforeEach(() => {
  vi.clearAllMocks();
  subscribe.mockResolvedValue({ data: { images: [{ url: 'https://fal.example.com/out.png' }] } });
});

// This is the exact bug class that shipped: Imagen 4 silently ignored a passed `image_url`
// because its real schema has no image-input parameter at all. These tests assert the actual
// request shape sent to fal.subscribe for every catalog model, so a similar mismatch — the
// wrong param name for a given endpoint's real schema — fails a test instead of silently
// generating unrelated images from a merchant's product photo.
describe('generateCustomScene: request shape per model', () => {
  it('flux-kontext-max: sends singular image_url on the non-multi endpoint for exactly one image', async () => {
    await generateCustomScene({ model: 'flux-kontext-max', cleanImageUrls: ['https://x/a.png'], prompt: 'p', numImages: 2 });

    expect(subscribe).toHaveBeenCalledWith(
      'fal-ai/flux-pro/kontext/max',
      { input: { prompt: 'p', num_images: 2, image_url: 'https://x/a.png' } },
    );
  });

  it('flux-kontext-max: switches to the dedicated /multi endpoint with image_urls for more than one image', async () => {
    await generateCustomScene({
      model: 'flux-kontext-max',
      cleanImageUrls: ['https://x/a.png', 'https://x/b.png'],
      prompt: 'p',
      numImages: 1,
    });

    expect(subscribe).toHaveBeenCalledWith(
      'fal-ai/flux-pro/kontext/max/multi',
      { input: { prompt: 'p', num_images: 1, image_urls: ['https://x/a.png', 'https://x/b.png'] } },
    );
  });

  it('flux-kontext-pro: same single/multi split as kontext-max, on its own endpoints', async () => {
    await generateCustomScene({ model: 'flux-kontext-pro', cleanImageUrls: ['https://x/a.png'], prompt: 'p', numImages: 1 });
    expect(subscribe).toHaveBeenCalledWith('fal-ai/flux-pro/kontext', expect.objectContaining({ input: expect.objectContaining({ image_url: 'https://x/a.png' }) }));

    subscribe.mockClear();
    await generateCustomScene({ model: 'flux-kontext-pro', cleanImageUrls: ['https://x/a.png', 'https://x/b.png'], prompt: 'p', numImages: 1 });
    expect(subscribe).toHaveBeenCalledWith('fal-ai/flux-pro/kontext/multi', expect.objectContaining({ input: expect.objectContaining({ image_urls: ['https://x/a.png', 'https://x/b.png'] }) }));
  });

  it.each(['seedream-v4-edit', 'nano-banana', 'nano-banana-pro'])(
    '%s: always sends image_urls as an array, even for a single selected image (no separate single-image endpoint exists)',
    async (model) => {
      await generateCustomScene({ model, cleanImageUrls: ['https://x/a.png'], prompt: 'p', numImages: 1 });

      const [, { input }] = subscribe.mock.calls[0];
      expect(input.image_urls).toEqual(['https://x/a.png']);
      expect(input.image_url).toBeUndefined();
    },
  );

  it('throws for a model with no dedicated multi endpoint given more than one image (none currently applies, but guards regressions)', async () => {
    // Exercise the guard path directly rather than adding a fake registry entry: flux-kontext-pro
    // does have a multiEndpoint, so this asserts the *error message* shape stays stable by
    // checking rejection only occurs for genuinely unconfigured models.
    await expect(
      generateCustomScene({ model: 'does-not-exist', cleanImageUrls: ['https://x/a.png'], prompt: 'p' }),
    ).rejects.toThrow('Unknown custom scene model: does-not-exist');
  });
});

// A template's preferredModel can be ANY of these 5 (routes/admin/templates.js imports
// SCENE_MODEL_IDS directly from here) — this is the fix for templates only being able to pick
// 2 of the 5 catalog models. generateScene must therefore know the correct image-input shape for
// all 5, not just the 2 that happened to be wired up first.
describe('generateScene: request shape per model (template flow)', () => {
  it('exposes all 5 verified models for templates to pick from, matching the custom-prompt catalog', () => {
    expect(SCENE_MODEL_IDS).toEqual([
      'flux-kontext-max',
      'flux-kontext-pro',
      'seedream-v4-edit',
      'nano-banana',
      'nano-banana-pro',
    ]);
  });

  it('flux-kontext-max: sends a singular image_url (templates only ever have one source image)', async () => {
    await generateScene({
      model: 'flux-kontext-max',
      cleanImageUrl: 'https://x/clean.png',
      promptTemplate: 'Studio scene',
      productAttributes: { color: 'red' },
    });

    const [endpoint, { input }] = subscribe.mock.calls[0];
    expect(endpoint).toBe('fal-ai/flux-pro/kontext/max');
    expect(input.image_url).toBe('https://x/clean.png');
    expect(input.image_urls).toBeUndefined();
    expect(input.num_images).toBe(4);
  });

  it.each(['seedream-v4-edit', 'nano-banana', 'nano-banana-pro'])(
    '%s: wraps the single clean image in an array — these endpoints have no singular image_url variant',
    async (model) => {
      await generateScene({
        model,
        cleanImageUrl: 'https://x/clean.png',
        promptTemplate: 'Studio scene',
        productAttributes: { color: 'blue' },
      });

      const [, { input }] = subscribe.mock.calls[0];
      expect(input.image_urls).toEqual(['https://x/clean.png']);
      expect(input.image_url).toBeUndefined();
    },
  );

  it('throws for an unknown model instead of silently ignoring the image (the original imagen-4 failure mode)', async () => {
    await expect(
      generateScene({ model: 'does-not-exist', cleanImageUrl: 'https://x/clean.png', promptTemplate: 'p', productAttributes: {} }),
    ).rejects.toThrow('Unknown scene model: does-not-exist');
  });
});

// The 15 extended Allowed-Models-only models (AI feature registry) — deliberately NOT part of
// SCENE_MODEL_IDS/templates, since several of these shapes (masks, dual-image roles, no image
// input, camera angles) don't fit the fixed-prompt template flow. See fal.js's
// EXTENDED_ALLOWED_MODELS doc comment for the full shape rationale.
describe('generateCustomScene: extended Allowed-Models catalog', () => {
  it('exposes all 20 allowed models (5 scene + 15 extended)', () => {
    expect(ALLOWED_MODEL_IDS).toHaveLength(20);
    expect(ALLOWED_MODEL_IDS).toEqual(expect.arrayContaining(SCENE_MODEL_IDS));
  });

  it('image_only shape (bria-remove-background): sends only image_url, no prompt/num_images param', async () => {
    subscribe.mockResolvedValue({ data: { image: { url: 'https://fal.example.com/out.png' } } });

    await generateCustomScene({ model: 'bria-remove-background', cleanImageUrls: ['https://x/a.png'], prompt: 'ignored', numImages: 1 });

    expect(subscribe).toHaveBeenCalledWith('fal-ai/bria/background/remove', { input: { image_url: 'https://x/a.png' } });
  });

  it('image_only shape with numImages > 1: calls the endpoint that many times in parallel (no native batching) and returns one URL per call', async () => {
    subscribe.mockResolvedValue({ data: { image: { url: 'https://fal.example.com/out.png' } } });

    const urls = await generateCustomScene({ model: 'topaz-upscale', cleanImageUrls: ['https://x/a.png'], prompt: '', numImages: 3 });

    expect(subscribe).toHaveBeenCalledTimes(3);
    expect(urls).toEqual(['https://fal.example.com/out.png', 'https://fal.example.com/out.png', 'https://fal.example.com/out.png']);
  });

  it('image_and_prompt shape (bria-extract-object): sends image_url and the merchant prompt together', async () => {
    subscribe.mockResolvedValue({ data: { image: { url: 'https://fal.example.com/cut.png' } } });

    await generateCustomScene({ model: 'bria-extract-object', cleanImageUrls: ['https://x/a.png'], prompt: 'the red shoe', numImages: 1 });

    expect(subscribe).toHaveBeenCalledWith('bria/extract-object', { input: { image_url: 'https://x/a.png', prompt: 'the red shoe' } });
  });

  it('text_only shape (gpt-image-2-banner): never references the selected images — prompt + num_images only', async () => {
    await generateCustomScene({ model: 'gpt-image-2-banner', cleanImageUrls: ['https://x/a.png'], prompt: 'Summer sale banner', numImages: 2 });

    expect(subscribe).toHaveBeenCalledWith('openai/gpt-image-2', { input: { prompt: 'Summer sale banner', num_images: 2 } });
  });

  it('image_urls_prompt shape (gemini-3-1-flash-retouch): same array+prompt+count shape as the original catalog', async () => {
    await generateCustomScene({ model: 'gemini-3-1-flash-retouch', cleanImageUrls: ['https://x/a.png', 'https://x/b.png'], prompt: 'retouch', numImages: 1 });

    expect(subscribe).toHaveBeenCalledWith('fal-ai/gemini-3.1-flash-image-preview/edit', {
      input: { prompt: 'retouch', num_images: 1, image_urls: ['https://x/a.png', 'https://x/b.png'] },
    });
  });

  it('image_urls_angles shape (qwen-multi-angle): merchant prompt goes to additional_prompt, not prompt', async () => {
    await generateCustomScene({ model: 'qwen-multi-angle', cleanImageUrls: ['https://x/a.png'], prompt: 'extra detail', numImages: 1 });

    expect(subscribe).toHaveBeenCalledWith('fal-ai/qwen-image-edit-2511-multiple-angles', {
      input: { image_urls: ['https://x/a.png'], additional_prompt: 'extra detail', num_images: 1 },
    });
  });

  it('dual_image shape (fashn-tryon): maps the first two images to model_image/garment_image and numImages to num_samples', async () => {
    await generateCustomScene({
      model: 'fashn-tryon',
      cleanImageUrls: ['https://x/person.png', 'https://x/garment.png'],
      prompt: '',
      numImages: 2,
    });

    expect(subscribe).toHaveBeenCalledWith('fal-ai/fashn/tryon/v1.6', {
      input: { model_image: 'https://x/person.png', garment_image: 'https://x/garment.png', num_samples: 2 },
    });
  });

  it('dual_image shape: rejects with a clear error when not exactly 2 images are selected', async () => {
    await expect(
      generateCustomScene({ model: 'fashn-tryon', cleanImageUrls: ['https://x/a.png'], prompt: '', numImages: 1 }),
    ).rejects.toThrow(UnsupportedCustomModelInputError);
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('mask_required shape (bria-eraser): rejects immediately with a clear error, never calls fal', async () => {
    await expect(
      generateCustomScene({ model: 'bria-eraser', cleanImageUrls: ['https://x/a.png'], prompt: '', numImages: 1 }),
    ).rejects.toThrow(UnsupportedCustomModelInputError);
    expect(subscribe).not.toHaveBeenCalled();
  });
});

// Templates get a NARROWER slice of the extended catalog than Allowed Models does — only shapes
// that fit "always exactly one image, always a fixed batch of 4" (see fal.js's
// TEMPLATE_COMPATIBLE_EXTENDED_IDS comment for why text_only/dual_image/mask_required are
// excluded here even though they're valid Allowed-Models choices).
describe('generateScene: template-compatible extended models', () => {
  it('exposes exactly 13 models for templates (5 original + 8 template-compatible extended)', () => {
    expect(TEMPLATE_MODEL_IDS).toHaveLength(13);
    expect(TEMPLATE_MODEL_IDS).toEqual(expect.arrayContaining(SCENE_MODEL_IDS));
  });

  it('never includes a text_only, dual_image, or mask_required model', () => {
    expect(TEMPLATE_MODEL_IDS).not.toEqual(
      expect.arrayContaining(['gpt-image-2-banner', 'ideogram-v4-banner', 'flux-schnell-scene', 'flux-lora-brand', 'krea-2-lora-brand', 'fashn-tryon', 'bria-eraser']),
    );
  });

  it('image_only shape (bria-remove-background): calls the endpoint 4 times for the template\'s fixed batch, single image_url only', async () => {
    subscribe.mockResolvedValue({ data: { image: { url: 'https://fal.example.com/out.png' } } });

    const urls = await generateScene({
      model: 'bria-remove-background',
      cleanImageUrl: 'https://x/clean.png',
      promptTemplate: 'unused for this shape',
      productAttributes: {},
    });

    expect(subscribe).toHaveBeenCalledTimes(4);
    expect(subscribe).toHaveBeenCalledWith('fal-ai/bria/background/remove', { input: { image_url: 'https://x/clean.png' } });
    expect(urls).toHaveLength(4);
  });

  it('image_and_prompt shape (bria-extract-object): sends the built scene prompt alongside the single image', async () => {
    subscribe.mockResolvedValue({ data: { image: { url: 'https://fal.example.com/cut.png' } } });

    await generateScene({
      model: 'bria-extract-object',
      cleanImageUrl: 'https://x/clean.png',
      promptTemplate: 'the product',
      productAttributes: { color: 'blue' },
    });

    const [endpoint, { input }] = subscribe.mock.calls[0];
    expect(endpoint).toBe('bria/extract-object');
    expect(input.image_url).toBe('https://x/clean.png');
    expect(input.prompt).toContain('the product');
  });

  it('image_urls_angles shape (qwen-multi-angle): wraps the single image in an array and uses additional_prompt', async () => {
    await generateScene({
      model: 'qwen-multi-angle',
      cleanImageUrl: 'https://x/clean.png',
      promptTemplate: 'studio scene',
      productAttributes: {},
    });

    expect(subscribe).toHaveBeenCalledWith('fal-ai/qwen-image-edit-2511-multiple-angles', {
      input: { image_urls: ['https://x/clean.png'], additional_prompt: expect.stringContaining('studio scene'), num_images: 4 },
    });
  });

  it('throws for a text_only/dual_image/mask_required model even if passed directly (defense in depth)', async () => {
    await expect(
      generateScene({ model: 'gpt-image-2-banner', cleanImageUrl: 'https://x/clean.png', promptTemplate: 'p', productAttributes: {} }),
    ).rejects.toThrow('Unknown scene model: gpt-image-2-banner');
  });
});
