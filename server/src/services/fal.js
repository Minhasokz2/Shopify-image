import { fal } from '@fal-ai/client';
import { env } from '../config/env.js';

fal.config({ credentials: env.FAL_KEY });

const VIDEO_ENDPOINTS = {
  'seedance-fast': 'bytedance/seedance-2.0/fast/image-to-video',
  'kling-3': 'kling/kling-3.0/image-to-video',
  'wan-2.7': 'wan/2.7/style-transfer',
};

// Single source of truth for every scene-capable model, shared by BOTH the fixed-prompt template
// flow (generateScene) and the custom-prompt flow (generateCustomScene) — see
// routes/admin/templates.js and routes/admin/models.js, which both import SCENE_MODEL_IDS rather
// than hardcoding their own lists. Every endpoint_id and its image-input shape below was verified
// live against fal.ai's real schema (get_model_schema), not guessed — the whole point of this
// table existing is to never repeat the Imagen 4 mistake (it was previously possible for a
// template to be assigned a model this table didn't know how to call correctly). `imageParam` is
// the thing that varies meaningfully between these models' request shape:
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

export const SCENE_MODEL_IDS = Object.keys(CUSTOM_SCENE_MODELS);

// Step 1 of the two-step pipeline (spec Section 4/8) — always runs before scene/UGC generation.
export async function removeBackground(imageUrl) {
  const result = await fal.subscribe('fal-ai/birefnet', { input: { image_url: imageUrl } });
  return result.data.image.url;
}

// Step 2 for static scenes (template flow — fixed prompt, always exactly one source image, always
// a fixed batch of 4 — unlike the custom flow, template cost is flat/per-job, not per-image).
// `productAttributes.color` is threaded into the prompt as an explicit product-fidelity lock.
export async function generateScene({ model, cleanImageUrl, promptTemplate, productAttributes, brandStyleProfile }) {
  const config = CUSTOM_SCENE_MODELS[model];
  if (!config) throw new Error(`Unknown scene model: ${model}`);

  const lockRules = `Preserve exact product color (${productAttributes?.color ?? 'as shown'}), logo, and label text. Do not alter product shape or proportions.`;
  const stylePrefix = brandStyleProfile
    ? `Match brand visual style: palette ${brandStyleProfile.palette.join(', ')}, tone ${brandStyleProfile.tone}. `
    : '';
  const input = {
    prompt: `${stylePrefix}${lockRules} Scene: ${promptTemplate}`,
    num_images: 4,
    [config.imageParam]: config.imageParam === 'image_urls' ? [cleanImageUrl] : cleanImageUrl,
  };

  const result = await fal.subscribe(config.endpoint, { input });
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

// Re-exported so other service modules (e.g. aiFeatureModels.js) reuse this already-configured
// client instead of importing @fal-ai/client fresh and calling fal.config() a second time.
export { fal };
