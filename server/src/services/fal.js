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

// The 10-feature AI model registry (see aiFeatureModels.js for the full primary+fallback
// rationale) added to Allowed Models as individually-selectable custom-prompt models — Allowed
// Models has no automatic-fallback concept, so each fallback becomes its own standalone option
// instead of an invisible retry. Deliberately kept OUT of CUSTOM_SCENE_MODELS/SCENE_MODEL_IDS
// above: those feed routes/admin/templates.js's template picker too, and the fixed-prompt
// template flow (generateScene, always exactly one image + always num_images: 4) cannot support
// several of these shapes (masks, dual-image roles, no-image-at-all, camera-angle params).
// Templates continue to offer only the original 5 models; only Allowed Models (custom-prompt
// flow) gets the 15 below.
//
// Every endpoint_id and inputShape was verified against fal.ai's real schema before being added
// (2 of the 10 originally-requested features' primaries — Retouch/Enhance's nano-banana-pro/edit
// and Lifestyle Scene's flux-pro/kontext — are already in CUSTOM_SCENE_MODELS above, so they're
// not duplicated here; this covers the other 15 distinct primary+fallback IDs).
//
// `inputShape` decides how generateCustomScene below builds that model's request:
//   - 'image_only'        → single image_url, no prompt/num_images param exists on this model.
//                           None of these support native batching either, so generateCustomScene
//                           calls the endpoint `numImages` times in parallel instead — keeping
//                           credit charging (creditCost × numImages, see creditLedger.js) matched
//                           to what the merchant actually receives.
//   - 'image_and_prompt'  → single image_url + the merchant's prompt (e.g. "which object to cut
//                           out"). Same no-native-batching situation as 'image_only' — looped.
//   - 'image_urls_prompt' → same shape as the image_urls models above (array + prompt + count)
//   - 'text_only'         → prompt only — NO image param at all. The merchant's selected image(s)
//                           are NOT sent and NOT reflected in the output. Real limitation of these
//                           models (pure text-to-image), not a bug; labeled clearly in the admin
//                           UI (ModelForm.jsx) for exactly this reason.
//   - 'dual_image'        → needs two DIFFERENT image roles (a person/model photo and a separate
//                           garment photo), not a list of interchangeable references. Requires
//                           the merchant to select exactly 2 images, in that order.
//   - 'image_urls_angles' → image_urls array; camera angle stays at this model's defaults (front
//                           view, eye-level, medium shot) since there's no angle-slider UI to set
//                           horizontal/vertical/zoom — functions, just can't be aimed yet.
//   - 'mask_required'     → this model REQUIRES a mask (the exact area to edit) that nothing in
//                           this app can currently draw or supply. generateCustomScene throws a
//                           clear, immediate error for this shape rather than sending fal a
//                           request with no mask_url and surfacing a confusing raw API error.
// `outputField` is 'images' (array, the default assumed by generateCustomScene's original 5
// models) or 'image' (singular) — several of these return a single image, not an array; treating
// them as arrays would throw on `.map` of undefined.
const EXTENDED_ALLOWED_MODELS = {
  'bria-remove-background': {
    endpoint: 'fal-ai/bria/background/remove',
    inputShape: 'image_only',
    outputField: 'image',
    supportsMultiImage: false,
  },
  birefnet: {
    endpoint: 'fal-ai/birefnet',
    inputShape: 'image_only',
    outputField: 'image',
    supportsMultiImage: false,
  },
  'bria-extract-object': {
    endpoint: 'bria/extract-object',
    inputShape: 'image_and_prompt',
    outputField: 'image',
    supportsMultiImage: false,
  },
  rembg: {
    endpoint: 'fal-ai/imageutils/rembg',
    inputShape: 'image_only',
    outputField: 'image',
    supportsMultiImage: false,
  },
  'gemini-3-1-flash-retouch': {
    endpoint: 'fal-ai/gemini-3.1-flash-image-preview/edit',
    inputShape: 'image_urls_prompt',
    outputField: 'images',
    supportsMultiImage: true,
  },
  'gpt-image-2-banner': {
    endpoint: 'openai/gpt-image-2',
    inputShape: 'text_only',
    outputField: 'images',
    supportsMultiImage: false,
  },
  'ideogram-v4-banner': {
    endpoint: 'ideogram/v4',
    inputShape: 'text_only',
    outputField: 'images',
    supportsMultiImage: false,
  },
  'flux-schnell-scene': {
    endpoint: 'fal-ai/flux/schnell',
    inputShape: 'text_only',
    outputField: 'images',
    supportsMultiImage: false,
  },
  'topaz-upscale': {
    endpoint: 'fal-ai/topaz/upscale/image',
    inputShape: 'image_only',
    outputField: 'image',
    supportsMultiImage: false,
  },
  'seedvr-upscale': {
    endpoint: 'fal-ai/seedvr/upscale/image',
    inputShape: 'image_only',
    outputField: 'image',
    supportsMultiImage: false,
  },
  'fashn-tryon': {
    endpoint: 'fal-ai/fashn/tryon/v1.6',
    inputShape: 'dual_image',
    outputField: 'images',
    supportsMultiImage: true, // exactly 2, not "as many as you like" — enforced in generateCustomScene
  },
  'bria-eraser': {
    endpoint: 'fal-ai/bria/eraser',
    inputShape: 'mask_required',
    outputField: 'image',
    supportsMultiImage: false,
  },
  'qwen-multi-angle': {
    endpoint: 'fal-ai/qwen-image-edit-2511-multiple-angles',
    inputShape: 'image_urls_angles',
    outputField: 'images',
    supportsMultiImage: true,
  },
  'flux-lora-brand': {
    endpoint: 'fal-ai/flux-lora',
    inputShape: 'text_only',
    outputField: 'images',
    supportsMultiImage: false,
  },
  'krea-2-lora-brand': {
    endpoint: 'fal-ai/krea-2/turbo/lora',
    inputShape: 'text_only',
    outputField: 'images',
    supportsMultiImage: false,
  },
};

export const ALLOWED_MODEL_IDS = [...SCENE_MODEL_IDS, ...Object.keys(EXTENDED_ALLOWED_MODELS)];

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

export class UnsupportedCustomModelInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsupportedCustomModelInputError';
    this.statusCode = 422;
  }
}

// Custom-prompt scene generation: merchant writes their own prompt, picks an admin-allowed
// model, and controls how many images to generate (numImages) — cost scales with this in
// creditLedger.js, so an accidental over-generation never silently overcharges OR undercharges.
// Checks CUSTOM_SCENE_MODELS first (original 5, untouched logic/behavior) before falling through
// to EXTENDED_ALLOWED_MODELS (the 15 newer models with more varied request/response shapes).
export async function generateCustomScene({ model, cleanImageUrls, prompt, numImages = 1 }) {
  const sceneConfig = CUSTOM_SCENE_MODELS[model];
  if (sceneConfig) {
    return generateFromSceneCatalog(sceneConfig, model, { cleanImageUrls, prompt, numImages });
  }

  const extendedConfig = EXTENDED_ALLOWED_MODELS[model];
  if (extendedConfig) {
    return generateFromExtendedCatalog(extendedConfig, model, { cleanImageUrls, prompt, numImages });
  }

  throw new Error(`Unknown custom scene model: ${model}`);
}

async function generateFromSceneCatalog(config, model, { cleanImageUrls, prompt, numImages }) {
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

function extractUrl(result, outputField) {
  return outputField === 'image' ? result.data.image.url : null;
}

async function generateFromExtendedCatalog(config, model, { cleanImageUrls, prompt, numImages }) {
  if (config.inputShape === 'mask_required') {
    throw new UnsupportedCustomModelInputError(
      `Model "${model}" requires a mask (the exact area to edit), which this app's UI cannot currently create. ` +
        'This model cannot be used from the custom-prompt studio yet.',
    );
  }

  if (config.inputShape === 'dual_image') {
    if (cleanImageUrls.length !== 2) {
      throw new UnsupportedCustomModelInputError(
        `Model "${model}" requires exactly 2 images: a photo of the person/model first, then the garment photo second.`,
      );
    }
    const result = await fal.subscribe(config.endpoint, {
      input: { model_image: cleanImageUrls[0], garment_image: cleanImageUrls[1], num_samples: numImages },
    });
    return result.data.images.map((img) => img.url);
  }

  if (config.inputShape === 'text_only') {
    // No image_url/image_urls param exists on this endpoint at all — cleanImageUrls is
    // intentionally unused here. See the EXTENDED_ALLOWED_MODELS doc comment above.
    const result = await fal.subscribe(config.endpoint, { input: { prompt, num_images: numImages } });
    return result.data.images.map((img) => img.url);
  }

  if (config.inputShape === 'image_urls_prompt') {
    const result = await fal.subscribe(config.endpoint, {
      input: { prompt, num_images: numImages, image_urls: cleanImageUrls },
    });
    return result.data.images.map((img) => img.url);
  }

  if (config.inputShape === 'image_urls_angles') {
    // additional_prompt, not prompt — this endpoint auto-constructs its own prompt from the
    // (unset, default) angle parameters and appends this as extra guidance text.
    const result = await fal.subscribe(config.endpoint, {
      input: { image_urls: cleanImageUrls, additional_prompt: prompt, num_images: numImages },
    });
    return result.data.images.map((img) => img.url);
  }

  // 'image_only' / 'image_and_prompt' — neither has a native batch/num_images parameter, so
  // produce exactly `numImages` results by calling the endpoint that many times in parallel,
  // keeping credit charging (creditCost × numImages) matched to what's actually returned.
  const input = config.inputShape === 'image_and_prompt' ? { image_url: cleanImageUrls[0], prompt } : { image_url: cleanImageUrls[0] };
  const results = await Promise.all(
    Array.from({ length: numImages }, () => fal.subscribe(config.endpoint, { input })),
  );
  return results.map((result) => extractUrl(result, config.outputField));
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
