import { describe, it, expect, vi, beforeEach } from 'vitest';

const removeBackground = vi.fn(async () => 'https://r2.example.com/clean.png');
const generateScene = vi.fn(async () => ['https://fal.example.com/1.png']);
const generateUGC = vi.fn(async () => ['https://openai.example.com/1.png']);
const generateVideoWithFallback = vi.fn(async () => 'https://fal.example.com/video.mp4');

vi.mock('../../src/services/fal.js', () => ({ removeBackground, generateScene }));
vi.mock('../../src/services/openaiImages.js', () => ({ generateUGC }));
vi.mock('../../src/services/videoGeneration.js', () => ({ generateVideoWithFallback }));

const { routeModel, executeGeneration, UnknownContentTypeError } = await import('../../src/services/modelRouter.js');

const TEMPLATES = {
  'studio-white': { preferredModel: 'flux-kontext-max' },
  'gradient-soft': { preferredModel: 'flux-kontext-pro' },
  'color-critical-studio': { preferredModel: 'imagen-4' },
  'ugc-home-casual': { preferredModel: 'gpt-image-2' },
  'video-slow-rotate': { preferredModel: 'seedance-fast' },
  'video-cinematic-pan': { preferredModel: 'kling-3' },
  'video-style-transfer': { preferredModel: 'wan-2.7' },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('routeModel', () => {
  it('routes static scenes to the template preferred model by default', () => {
    expect(routeModel({ contentType: 'scene', productCategoryTag: 'apparel', templateId: 'studio-white', templates: TEMPLATES })).toBe(
      'flux-kontext-max',
    );
  });

  it.each(['skincare', 'cosmetics', 'makeup', 'beauty', 'SKINCARE', 'Cosmetics'])(
    'routes color-critical category "%s" to imagen-4 regardless of the template',
    (category) => {
      expect(routeModel({ contentType: 'scene', productCategoryTag: category, templateId: 'studio-white', templates: TEMPLATES })).toBe(
        'imagen-4',
      );
    },
  );

  it('routes every UGC job to gpt-image-2 regardless of template', () => {
    expect(routeModel({ contentType: 'ugc', productCategoryTag: 'apparel', templateId: 'ugc-home-casual', templates: TEMPLATES })).toBe(
      'gpt-image-2',
    );
  });

  it.each([
    ['video-slow-rotate', 'seedance-fast'],
    ['video-cinematic-pan', 'kling-3'],
    ['video-style-transfer', 'wan-2.7'],
  ])('routes video template %s to its per-template model %s', (templateId, expected) => {
    expect(routeModel({ contentType: 'video', productCategoryTag: null, templateId, templates: TEMPLATES })).toBe(expected);
  });

  it('throws for an unknown contentType', () => {
    expect(() => routeModel({ contentType: 'bogus', templateId: 'studio-white', templates: TEMPLATES })).toThrow(
      UnknownContentTypeError,
    );
  });

  it('throws for an unknown templateId', () => {
    expect(() => routeModel({ contentType: 'scene', templateId: 'does-not-exist', templates: TEMPLATES })).toThrow();
  });
});

describe('executeGeneration', () => {
  it('runs background removal then the routed scene model, using the literal endpoint-mapped model name', async () => {
    const result = await executeGeneration({
      contentType: 'scene',
      productCategoryTag: 'apparel',
      templateId: 'studio-white',
      templates: TEMPLATES,
      sourceImageUrl: 'https://shop.example.com/raw.png',
      promptTemplate: 'Clean white studio',
      productAttributes: { color: 'red' },
    });

    expect(removeBackground).toHaveBeenCalledWith('https://shop.example.com/raw.png');
    expect(generateScene).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'flux-kontext-max', cleanImageUrl: 'https://r2.example.com/clean.png' }),
    );
    expect(result.model).toBe('flux-kontext-max');
    expect(result.variationUrls).toEqual(['https://fal.example.com/1.png']);
  });

  it('skips background removal when a clean image is already supplied', async () => {
    await executeGeneration({
      contentType: 'video',
      templateId: 'video-slow-rotate',
      templates: TEMPLATES,
      cleanImageUrl: 'https://r2.example.com/already-clean.png',
      motionPrompt: 'slow rotate',
      aspectRatio: '9:16',
    });

    expect(removeBackground).not.toHaveBeenCalled();
    expect(generateVideoWithFallback).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'seedance-fast', cleanImageUrl: 'https://r2.example.com/already-clean.png' }),
    );
  });

  it('dispatches UGC jobs to generateUGC with the persona settings intact', async () => {
    const personaSettings = { ageRange: 'adult', genderPresentation: 'feminine', setting: 'home' };
    await executeGeneration({
      contentType: 'ugc',
      templateId: 'ugc-home-casual',
      templates: TEMPLATES,
      sourceImageUrl: 'https://shop.example.com/raw.png',
      promptTemplate: 'Casual home setting',
      personaSettings,
    });

    expect(generateUGC).toHaveBeenCalledWith(expect.objectContaining({ personaSettings }));
  });
});
