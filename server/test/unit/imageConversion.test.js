import { describe, it, expect, vi, beforeEach } from 'vitest';

const upload = vi.fn();
const destroy = vi.fn(async () => ({ result: 'ok' }));
vi.mock('../../src/lib/cloudinary.js', () => ({ cloudinary: { uploader: { upload, destroy } } }));

const { convertImage, destroyCloudinaryAsset, isSvgInput } = await import('../../src/services/imageConversion.js');

function mockUploadResult({ bytes = 100000, eagerBytes = [40000] } = {}) {
  return {
    public_id: 'shop.myshopify.com/job-1',
    bytes,
    eager: eagerBytes.map((b) => ({ secure_url: `https://cloudinary.example.com/out-${b}.img`, bytes: b })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('convertImage: eager transformation request shape', () => {
  it('requests a single eager entry with the default quality for WebP-only output', async () => {
    upload.mockResolvedValue(mockUploadResult());

    await convertImage({
      sourceUrl: 'https://cdn.shopify.com/a.jpg',
      shopDomain: 'shop.myshopify.com',
      publicId: 'shop.myshopify.com/job-1',
      inputFormat: 'jpg',
      outputFormats: ['webp'],
    });

    const [, options] = upload.mock.calls[0];
    expect(options.eager).toEqual([{ format: 'webp', quality: 82 }]);
    expect(options.eager_async).toBe(false);
    expect(options.format).toBeUndefined();
  });

  it('requests both formats, in order, when both are selected', async () => {
    upload.mockResolvedValue(mockUploadResult({ eagerBytes: [40000, 30000] }));

    await convertImage({
      sourceUrl: 'https://cdn.shopify.com/a.jpg',
      shopDomain: 'shop.myshopify.com',
      publicId: 'x',
      inputFormat: 'jpg',
      outputFormats: ['webp', 'avif'],
    });

    const [, options] = upload.mock.calls[0];
    expect(options.eager).toEqual([
      { format: 'webp', quality: 82 },
      { format: 'avif', quality: 60 },
    ]);
  });

  it('applies a merchant-supplied quality to every requested format instead of the per-format default', async () => {
    upload.mockResolvedValue(mockUploadResult({ eagerBytes: [40000, 30000] }));

    await convertImage({
      sourceUrl: 'https://cdn.shopify.com/a.jpg',
      shopDomain: 'shop.myshopify.com',
      publicId: 'x',
      inputFormat: 'jpg',
      outputFormats: ['webp', 'avif'],
      quality: 95,
    });

    const [, options] = upload.mock.calls[0];
    expect(options.eager).toEqual([
      { format: 'webp', quality: 95 },
      { format: 'avif', quality: 95 },
    ]);
  });

  it('adds the awebp flag only to the webp entry for an animated GIF, never to avif', async () => {
    upload.mockResolvedValue(mockUploadResult({ eagerBytes: [40000, 30000] }));

    await convertImage({
      sourceUrl: 'https://cdn.shopify.com/a.gif',
      shopDomain: 'shop.myshopify.com',
      publicId: 'x',
      inputFormat: 'gif',
      outputFormats: ['webp', 'avif'],
      isAnimatedGif: true,
    });

    const [, options] = upload.mock.calls[0];
    expect(options.eager[0]).toEqual({ format: 'webp', quality: 82, flags: 'awebp' });
    expect(options.eager[1]).toEqual({ format: 'avif', quality: 60 });
  });

  it('rasterizes SVG input to png and adds dpr:2.0 to every eager entry — the only input format needing this', async () => {
    upload.mockResolvedValue(mockUploadResult({ eagerBytes: [40000] }));

    await convertImage({
      sourceUrl: 'https://cdn.shopify.com/logo.svg',
      shopDomain: 'shop.myshopify.com',
      publicId: 'x',
      inputFormat: 'svg',
      outputFormats: ['webp'],
    });

    const [, options] = upload.mock.calls[0];
    expect(options.format).toBe('png');
    expect(options.eager).toEqual([{ format: 'webp', quality: 82, dpr: '2.0' }]);
  });

  it('isSvgInput is case-insensitive', () => {
    expect(isSvgInput('SVG')).toBe(true);
    expect(isSvgInput('svg')).toBe(true);
    expect(isSvgInput('png')).toBe(false);
    expect(isSvgInput(undefined)).toBe(false);
  });
});

describe('convertImage: savings calculation', () => {
  it('computes savedBytes against the SMALLEST converted asset when multiple formats are requested', async () => {
    upload.mockResolvedValue(mockUploadResult({ bytes: 100000, eagerBytes: [45000, 30000] }));

    const result = await convertImage({
      sourceUrl: 'https://cdn.shopify.com/a.jpg',
      shopDomain: 'shop.myshopify.com',
      publicId: 'x',
      inputFormat: 'jpg',
      outputFormats: ['webp', 'avif'],
    });

    expect(result.originalBytes).toBe(100000);
    expect(result.savedBytes).toBe(70000); // 100000 - 30000 (the smaller of the two)
    expect(result.convertedAssets).toHaveLength(2);
  });

  it('never reports negative savings when the converted asset is larger than the original', async () => {
    upload.mockResolvedValue(mockUploadResult({ bytes: 10000, eagerBytes: [12000] }));

    const result = await convertImage({
      sourceUrl: 'https://cdn.shopify.com/a.jpg',
      shopDomain: 'shop.myshopify.com',
      publicId: 'x',
      inputFormat: 'jpg',
      outputFormats: ['webp'],
    });

    expect(result.savedBytes).toBe(0);
  });
});

describe('destroyCloudinaryAsset', () => {
  it('destroys the given public id as an image resource', async () => {
    await destroyCloudinaryAsset('shop.myshopify.com/job-1');
    expect(destroy).toHaveBeenCalledWith('shop.myshopify.com/job-1', { resource_type: 'image' });
  });
});
