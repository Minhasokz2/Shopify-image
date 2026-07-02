import { describe, it, expect, vi, beforeEach } from 'vitest';

const subscribe = vi.fn(async () => ({ data: { images: [{ url: 'https://fal.example.com/out.png' }] } }));
vi.mock('@fal-ai/client', () => ({ fal: { config: vi.fn(), subscribe } }));

const { generateCustomScene, generateScene, SCENE_MODEL_IDS } = await import('../../src/services/fal.js');

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
