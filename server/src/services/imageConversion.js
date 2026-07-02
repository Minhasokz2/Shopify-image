import { cloudinary } from '../lib/cloudinary.js';

// Every format the feature accepts as INPUT — Cloudinary auto-detects the real format from the
// bytes/URL itself, this list is only used for client-side validation and the "SVG will be
// rasterized" / "GIF animation" UI flags below.
export const SUPPORTED_INPUT_FORMATS = ['jpg', 'jpeg', 'png', 'gif', 'heic', 'bmp', 'tiff', 'tif', 'svg', 'webp'];
export const SUPPORTED_OUTPUT_FORMATS = ['webp', 'avif'];

const DEFAULT_QUALITY = { webp: 82, avif: 60 };

export function isSvgInput(inputFormat) {
  return inputFormat?.toLowerCase() === 'svg';
}

function buildEagerTransformations({ outputFormats, quality, isAnimatedGif }) {
  return outputFormats.map((format) => {
    const entry = { format, quality: quality ?? DEFAULT_QUALITY[format] ?? 75 };
    // Animated GIF -> animated WebP needs the `awebp` flag. Cloudinary has no equivalent
    // animated-output flag for AVIF, so a GIF converted to AVIF only keeps its first frame — this
    // is surfaced to the merchant in the UI rather than silently dropping the animation.
    if (isAnimatedGif && format === 'webp') {
      entry.flags = 'awebp';
    }
    return entry;
  });
}

// Converts one source image via Cloudinary's eager transformations. Runs `eager_async: false`
// (synchronous) deliberately: this always executes inside imageOptimizerWorker.js, our own
// in-process background worker, so a second async hop through Cloudinary's own
// webhook-notification mechanism would just be redundant complexity for image-sized (non-video)
// transformations, not a more correct architecture — see the code review notes in
// imageOptimizerWorker.js for the full rationale.
export async function convertImage({ sourceUrl, shopDomain, publicId, inputFormat, outputFormats, quality, isAnimatedGif }) {
  const eager = buildEagerTransformations({ outputFormats, quality, isAnimatedGif });
  const uploadOptions = {
    public_id: publicId,
    folder: `shopify-optimizer/${shopDomain}/originals`,
    resource_type: 'image',
    overwrite: true,
    eager,
    eager_async: false,
  };

  if (isSvgInput(inputFormat)) {
    // Cloudinary can't derive raster formats (webp/avif) from an SVG without rasterizing it
    // first — `format: 'png'` on the base upload does that, and the eager entries above then
    // chain from that rasterized version. `dpr: '2.0'` renders at 2x so simple vector art doesn't
    // come out soft after rasterization (surfaced to the merchant as "SVG will be rasterized at
    // 2x resolution" in the Convert Images UI).
    uploadOptions.format = 'png';
    uploadOptions.eager = eager.map((entry) => ({ ...entry, dpr: '2.0' }));
  }

  const result = await cloudinary.uploader.upload(sourceUrl, uploadOptions);

  const convertedAssets = (result.eager ?? []).map((eagerResult, index) => ({
    format: eager[index].format,
    url: eagerResult.secure_url,
    bytes: eagerResult.bytes,
  }));

  const originalBytes = result.bytes ?? 0;
  const smallestConverted = convertedAssets.reduce(
    (min, asset) => (min === null || asset.bytes < min ? asset.bytes : min),
    null,
  );
  const savedBytes = smallestConverted !== null ? Math.max(0, originalBytes - smallestConverted) : 0;

  return {
    cloudinaryPublicId: result.public_id,
    originalBytes,
    convertedAssets,
    savedBytes,
  };
}

export async function destroyCloudinaryAsset(publicId) {
  await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
}
