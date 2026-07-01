import { fal } from '@fal-ai/client';
import { env } from '../config/env.js';

fal.config({ credentials: env.FAL_KEY });

// Endpoint slugs per spec Section 7/8/10 — kept verbatim rather than guessed, since fal.ai's
// catalog is resolved server-side and can't be verified against a local type union.
const SCENE_ENDPOINTS = {
  'flux-kontext-max': 'fal-ai/flux-pro/kontext/max',
  'flux-kontext-pro': 'fal-ai/flux-pro/kontext',
  'imagen-4': 'fal-ai/imagen4',
};

const VIDEO_ENDPOINTS = {
  'seedance-fast': 'bytedance/seedance-2.0/fast/image-to-video',
  'kling-3': 'kling/kling-3.0/image-to-video',
  'wan-2.7': 'wan/2.7/style-transfer',
};

// Step 1 of the two-step pipeline (spec Section 4/8) — always runs before scene/UGC generation.
export async function removeBackground(imageUrl) {
  const result = await fal.subscribe('fal-ai/birefnet', { input: { image_url: imageUrl } });
  return result.data.image.url;
}

// Step 2 for static scenes. `productAttributes.color` is threaded into the prompt as an
// explicit product-fidelity lock — this is what keeps color-critical categories from drifting,
// on top of the color-critical categories being routed to Imagen 4 by modelRouter.js.
export async function generateScene({ model, cleanImageUrl, promptTemplate, productAttributes, brandStyleProfile }) {
  const endpoint = SCENE_ENDPOINTS[model];
  if (!endpoint) throw new Error(`Unknown scene model: ${model}`);

  const lockRules = `Preserve exact product color (${productAttributes?.color ?? 'as shown'}), logo, and label text. Do not alter product shape or proportions.`;
  const stylePrefix = brandStyleProfile
    ? `Match brand visual style: palette ${brandStyleProfile.palette.join(', ')}, tone ${brandStyleProfile.tone}. `
    : '';
  const result = await fal.subscribe(endpoint, {
    input: {
      prompt: `${stylePrefix}${lockRules} Scene: ${promptTemplate}`,
      image_url: cleanImageUrl,
      num_images: 4,
    },
  });
  return result.data.images.map((img) => img.url);
}

// Video jobs that start from an already-processed product image reuse it directly — no
// re-running of removeBackground (spec Section 8).
export async function generateVideo({ model, cleanImageUrl, motionPrompt, aspectRatio }) {
  const endpoint = VIDEO_ENDPOINTS[model];
  if (!endpoint) throw new Error(`Unknown video model: ${model}`);

  const result = await fal.subscribe(endpoint, {
    input: {
      image_url: cleanImageUrl,
      prompt: motionPrompt,
      duration: '5',
      aspect_ratio: aspectRatio,
      generate_audio: true,
    },
  });
  return result.data.video.url;
}
