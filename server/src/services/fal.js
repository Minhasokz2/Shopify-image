import { fal } from '@fal-ai/client';
import { env } from '../config/env.js';

fal.config({ credentials: env.FAL_KEY });

// Fixed-prompt template flow (spec Section 7/8/10) — every entry here MUST be a real
// image-to-image/editing endpoint, verified live against fal.ai's catalog. Imagen 4 was removed
// after live schema verification showed it has zero image-input parameters (pure text-to-image)
// — it was silently ignoring the product photo entirely, including via the color-critical
// category override in modelRouter.js, which routed skincare/cosmetics/beauty templates to it.
const SCENE_ENDPOINTS = {
  'flux-kontext-max': 'fal-ai/flux-pro/kontext/max',
  'flux-kontext-pro': 'fal-ai/flux-pro/kontext',
};

const VIDEO_ENDPOINTS = {
  'seedance-fast': 'bytedance/seedance-2.0/fast/image-to-video',
  'kling-3': 'kling/kling-3.0/image-to-video',
  'wan-2.7': 'wan/2.7/style-transfer',
};

// Custom-prompt flow's model registry (admin-managed via allowed_models — see
// routes/admin/models.js). Every endpoint_id and its image-input shape below was verified live
// against fal.ai's real schema (get_model_schema), not guessed — the whole point of this table
// existing is to never repeat the Imagen 4 mistake. `imageParam` is the ONLY thing that varies
// meaningfully between these models' request shape:
//   - 'image_url'  → singular endpoint takes exactly one image; a dedicated `multiEndpoint`
//                    (verified separately) is used instead when more than one image is selected.
//   - 'image_urls' → the endpoint always takes an array, even for a single image — there is no
//                    separate single-image variant for these.
const CUSTOM_SCENE_MODELS = {
  'flux-kontext-max': {
    endpoint: 'fal-ai/flux-pro/kontext/max',
    multiEndpoint: 'fal-ai/flux-pro/kontext/max/multi',
    imageParam: 'image_url',
  },
  'flux-kontext-pro': {
    endpoint: 'fal-ai/flux-pro/kontext',
    multiEndpoint: 'fal-ai/flux-pro/kontext/multi',
    imageParam: 'image_url',
  },
  'seedream-v4-edit': {
    endpoint: 'fal-ai/bytedance/seedream/v4/edit',
    imageParam: 'image_urls',
  },
  'nano-banana': {
    endpoint: 'fal-ai/gemini-25-flash-image/edit',
    imageParam: 'image_urls',
  },
  'nano-banana-pro': {
    endpoint: 'fal-ai/nano-banana-pro/edit',
    imageParam: 'image_urls',
  },
};

// Step 1 of the two-step pipeline (spec Section 4/8) — always runs before scene/UGC generation.
export async function removeBackground(imageUrl) {
  const result = await fal.subscribe('fal-ai/birefnet', { input: { image_url: imageUrl } });
  return result.data.image.url;
}

// Step 2 for static scenes (template flow — fixed prompt, always exactly one source image).
// `productAttributes.color` is threaded into the prompt as an explicit product-fidelity lock.
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

// Custom-prompt scene generation: merchant writes their own prompt, picks an admin-allowed
// model, and controls how many images to generate (numImages) — cost scales with this in
// creditLedger.js, so an accidental over-generation never silently overcharges OR undercharges.
export async function generateCustomScene({ model, cleanImageUrls, prompt, numImages = 1 }) {
  const config = CUSTOM_SCENE_MODELS[model];
  if (!config) throw new Error(`Unknown custom scene model: ${model}`);

  let endpoint = config.endpoint;
  const input = { prompt, num_images: numImages };

  if (config.imageParam === 'image_urls') {
    // This model's schema only ever takes an array — even a single selected image is sent as a
    // one-element array, there is no separate singular-image variant to fall back to.
    input.image_urls = cleanImageUrls;
  } else if (cleanImageUrls.length > 1) {
    if (!config.multiEndpoint) throw new Error(`Model "${model}" does not support multi-image reference`);
    endpoint = config.multiEndpoint;
    input.image_urls = cleanImageUrls;
  } else {
    input.image_url = cleanImageUrls[0];
  }

  const result = await fal.subscribe(endpoint, { input });
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
