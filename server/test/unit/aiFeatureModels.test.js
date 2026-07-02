import { describe, it, expect, vi, beforeEach } from 'vitest';

const subscribe = vi.fn();
vi.mock('../../src/services/fal.js', () => ({ fal: { subscribe } }));

const { AI_FEATURE_MODELS, runAiFeatureModel, AiFeatureModelError } = await import(
  '../../src/services/aiFeatureModels.js'
);

beforeEach(() => {
  vi.clearAllMocks();
});

// These 3 IDs were the ones the original spec got wrong (missing/extra "fal-ai/" prefix) — caught
// by live schema verification, not guessed. Locking them in as a regression guard so a future
// edit can't silently reintroduce the broken (404) versions.
describe('AI_FEATURE_MODELS: verified-correct endpoint IDs', () => {
  it('product_cutout primary has no fal-ai/ prefix (bria/extract-object lives directly under bria/)', () => {
    expect(AI_FEATURE_MODELS.product_cutout.primary).toBe('bria/extract-object');
  });

  it('generate_banner primary/fallback have no fal-ai/ prefix (openai/ and top-level ideogram/ namespaces)', () => {
    expect(AI_FEATURE_MODELS.generate_banner.primary).toBe('openai/gpt-image-2');
    expect(AI_FEATURE_MODELS.generate_banner.fallback).toBe('ideogram/v4');
  });

  it('registers exactly the 10 specified features', () => {
    expect(Object.keys(AI_FEATURE_MODELS)).toHaveLength(10);
  });

  it.each(['virtual_tryon', 'remove_watermark', 'multi_angle_shots'])(
    '%s has no fallback — these have no comparable alternative model',
    (featureKey) => {
      expect(AI_FEATURE_MODELS[featureKey].fallback).toBeNull();
    },
  );
});

describe('runAiFeatureModel', () => {
  it('calls the primary endpoint and returns its result on success', async () => {
    subscribe.mockResolvedValueOnce({ data: { image: { url: 'https://fal.example.com/out.png' } } });

    const result = await runAiFeatureModel('remove_background', { image_url: 'https://x/a.png' });

    expect(subscribe).toHaveBeenCalledWith('fal-ai/bria/background/remove', { input: { image_url: 'https://x/a.png' } });
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(result.data.image.url).toBe('https://fal.example.com/out.png');
  });

  it('retries on the fallback endpoint when the primary fails, for a feature with a fallback configured', async () => {
    subscribe.mockRejectedValueOnce(new Error('primary down')).mockResolvedValueOnce({ data: { image: { url: 'ok' } } });

    const result = await runAiFeatureModel('remove_background', { image_url: 'https://x/a.png' });

    expect(subscribe).toHaveBeenNthCalledWith(1, 'fal-ai/bria/background/remove', expect.anything());
    expect(subscribe).toHaveBeenNthCalledWith(2, 'fal-ai/birefnet', expect.anything());
    expect(result.data.image.url).toBe('ok');
  });

  it('throws immediately without a second call when the feature has no fallback configured', async () => {
    subscribe.mockRejectedValueOnce(new Error('primary down'));

    await expect(runAiFeatureModel('virtual_tryon', {})).rejects.toBeInstanceOf(AiFeatureModelError);
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('throws AiFeatureModelError with both underlying errors when primary and fallback both fail', async () => {
    subscribe.mockRejectedValueOnce(new Error('primary down')).mockRejectedValueOnce(new Error('fallback down too'));

    let caught;
    try {
      await runAiFeatureModel('remove_background', {});
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AiFeatureModelError);
    expect(caught.primaryError.message).toBe('primary down');
    expect(caught.fallbackError.message).toBe('fallback down too');
  });

  it('throws for an unknown feature key', async () => {
    await expect(runAiFeatureModel('does-not-exist', {})).rejects.toThrow('Unknown AI feature: does-not-exist');
    expect(subscribe).not.toHaveBeenCalled();
  });
});
