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

// The AI feature model registry (see aiFeatureModels.js for the full primary+fallback rationale)
// added to Allowed Models as individually-selectable custom-prompt models — Allowed Models has no
// automatic-fallback concept, so each fallback becomes its own standalone option instead of an
// invisible retry. Deliberately kept OUT of CUSTOM_SCENE_MODELS/SCENE_MODEL_IDS above: those feed
// routes/admin/templates.js's template picker too, and the fixed-prompt template flow
// (generateScene, always exactly one image + always num_images: 4) cannot support every shape
// here (dual-image roles). Templates continue to offer only the original 5 plus the subset of
// these that fits; only Allowed Models (custom-prompt flow) gets all of the below.
//
// Every endpoint_id and inputShape was verified against fal.ai's real schema before being added
// (2 of the 10 originally-requested features' primaries — Retouch/Enhance's nano-banana-pro/edit
// and Lifestyle Scene's flux-pro/kontext — are already in CUSTOM_SCENE_MODELS above, so they're
// not duplicated here).
//
// The pure text-to-image brand-asset LoRA models and the mask-required watermark/object eraser
// were removed from this catalog entirely: neither was a usable feature — the LoRA models
// silently ignored every merchant's selected product photo (the Imagen 4 failure mode) with no
// image-aware alternative available, and the eraser needs a mask this app has no UI to draw. The
// banner-generation models (GPT Image 2, Ideogram V4) looked like the same problem at first, but
// each has a separate, genuinely image-aware edit/image-to-image endpoint (verified live via
// get_model_schema) that takes the merchant's photo and a prompt together — those are what's
// registered below, not the text-only originals. Virtual Try-On (`fashn-tryon`, 'dual_image')
// also stays, but is driven by a dedicated guided flow (web/src/pages/VirtualTryOn.jsx) instead of
// the generic custom-prompt studio, since it needs two distinct image roles that flow can't label.
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
//   - 'dual_image'        → needs two DIFFERENT image roles (a person/model photo and a separate
//                           garment photo), not a list of interchangeable references. Requires
//                           the merchant to select exactly 2 images, in that order.
//   - 'image_urls_angles' → image_urls array; camera angle stays at this model's defaults (front
//                           view, eye-level, medium shot) since there's no angle-slider UI to set
//                           horizontal/vertical/zoom — functions, just can't be aimed yet.
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
  // The plain 'openai/gpt-image-2' and 'ideogram/v4' endpoints (checked and removed earlier) are
  // pure text-to-image — but both have separate, genuinely image-aware edit endpoints verified
  // live via get_model_schema: gpt-image-2/edit requires image_urls + prompt, and
  // v4/image-to-image requires a single image_url + prompt. These are the real "attach a photo,
  // write a prompt to add banner text / restyle it" models — not the text-only originals.
  'gpt-image-2-banner': {
    endpoint: 'openai/gpt-image-2/edit',
    inputShape: 'image_urls_prompt',
    outputField: 'images',
    supportsMultiImage: true,
  },
  'ideogram-v4-banner': {
    endpoint: 'ideogram/v4/image-to-image',
    inputShape: 'image_and_prompt',
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
  'qwen-multi-angle': {
    endpoint: 'fal-ai/qwen-image-edit-2511-multiple-angles',
    inputShape: 'image_urls_angles',
    outputField: 'images',
    supportsMultiImage: true,
  },
};

// Genuine text-to-image models — verified live via get_model_schema to have NO image_url/
// image_urls parameter at all (not "optional", literally absent from the schema), unlike every
// model above, which the same verification pass confirmed all genuinely require an image. These
// exist for merchants who want to generate a scene/graphic from scratch rather than edit an
// existing product photo — a fundamentally different job shape (no source image, no background
// removal step at all — see modelRouter.js's executeCustomGeneration).
const TEXT_TO_IMAGE_MODELS = {
  'ideogram-v4-text': { endpoint: 'ideogram/v4' }, // NOT fal-ai/ideogram/v4 — that id has no schema
  'imagen4-preview': { endpoint: 'fal-ai/imagen4/preview' },
  'flux-schnell': { endpoint: 'fal-ai/flux/schnell' },
  'recraft-v3-text': { endpoint: 'fal-ai/recraft/v3/text-to-image' },
  // Added in a later pass — same verification standard (get_model_schema confirmed prompt +
  // num_images in, images array out, no image_url/image_urls param at all).
  'seedream-v5-pro-text': { endpoint: 'bytedance/seedream/v5/pro/text-to-image' },
  'gemini-3-pro-text': { endpoint: 'fal-ai/gemini-3-pro-image-preview' }, // latest Gemini image model (aka Nano Banana Pro's text-to-image form)
  'qwen-image-text': { endpoint: 'fal-ai/qwen-image' },
  'flux-2-text': { endpoint: 'fal-ai/flux-2' },
  'grok-imagine-text': { endpoint: 'xai/grok-imagine-image' },
};

export const TEXT_TO_IMAGE_MODEL_IDS = Object.keys(TEXT_TO_IMAGE_MODELS);

export function isTextToImageModel(modelId) {
  return Object.hasOwn(TEXT_TO_IMAGE_MODELS, modelId);
}

// Prompt-only generation — no source image, so none of the two-step (remove background, then
// generate) pipeline the image-editing models go through applies here at all. All 4 registered
// endpoints return an `images` array and natively support `num_images`, so this needs no
// per-model branching the way generateCustomScene's image-shape dispatch does.
export async function generateTextToImage({ model, prompt, numImages = 1 }) {
  const config = TEXT_TO_IMAGE_MODELS[model];
  if (!config) throw new Error(`Unknown text-to-image model: ${model}`);

  const result = await fal.subscribe(config.endpoint, { input: { prompt, num_images: numImages } });
  return result.data.images.map((img) => img.url);
}

export const ALLOWED_MODEL_IDS = [...SCENE_MODEL_IDS, ...Object.keys(EXTENDED_ALLOWED_MODELS), ...TEXT_TO_IMAGE_MODEL_IDS];

// Single source of truth for "how many reference images does this model actually take", derived
// straight from the tables above rather than duplicated as separate per-model config — the
// custom-prompt UI (web/src/pages/CustomPromptStudio.jsx) needs this to cap how many images a
// merchant can select/upload for a given model (e.g. fashn-tryon needs exactly 2, most
// single-image models take exactly 1, the image_urls_* shapes take anywhere up to the shared
// job-creation max of 6 — see generationInputSchema's imageUrls.max(6) in jobCreation.js).
// `exact` is non-null only when the count can't vary at all (dual_image); everything else has a
// real min/max range instead. Text-to-image models get {0,0,0} — no attach control should even
// be shown for them, not just an empty-but-allowed range.
export function getImageCountConstraint(modelId) {
  if (isTextToImageModel(modelId)) return { min: 0, max: 0, exact: 0 };

  const extended = EXTENDED_ALLOWED_MODELS[modelId];
  if (extended) {
    if (extended.inputShape === 'dual_image') return { min: 2, max: 2, exact: 2 };
    return extended.supportsMultiImage ? { min: 1, max: 6, exact: null } : { min: 1, max: 1, exact: 1 };
  }

  const sceneModel = CUSTOM_SCENE_MODELS[modelId];
  if (sceneModel) {
    const supportsMulti = sceneModel.imageParam === 'image_urls' || Boolean(sceneModel.multiEndpoint);
    return supportsMulti ? { min: 1, max: 6, exact: null } : { min: 1, max: 1, exact: 1 };
  }

  // Unknown model id — default to the most conservative constraint rather than silently allowing
  // an unbounded upload the model might reject.
  return { min: 1, max: 1, exact: 1 };
}

// Of the 11 extended models, only these 10 are safe to offer as a TEMPLATE's model — templates are
// admin-configured once and then silently applied to every future job that uses them, unlike
// Allowed Models where the merchant explicitly picks a model themselves each time. Excluded on
// purpose, not by oversight: 'dual_image' (virtual try-on) needs two distinct image roles, and a
// template only ever has one product image slot, so there's no second image to assign a role to.
const TEMPLATE_COMPATIBLE_SHAPES = new Set(['image_only', 'image_and_prompt', 'image_urls_prompt', 'image_urls_angles']);
const TEMPLATE_COMPATIBLE_EXTENDED_IDS = Object.entries(EXTENDED_ALLOWED_MODELS)
  .filter(([, config]) => TEMPLATE_COMPATIBLE_SHAPES.has(config.inputShape))
  .map(([id]) => id);

export const TEMPLATE_MODEL_IDS = [...SCENE_MODEL_IDS, ...TEMPLATE_COMPATIBLE_EXTENDED_IDS];

// Step 1 of the two-step pipeline (spec Section 4/8) — always runs before scene/UGC generation.
export async function removeBackground(imageUrl) {
  const result = await fal.subscribe('fal-ai/birefnet', { input: { image_url: imageUrl } });
  return result.data.image.url;
}

// Step 2 for static scenes (template flow — fixed prompt, always exactly one source image).
// `numImages` (1-4) is merchant-chosen per generation and priced per-image (creditLedger.js) —
// defaults to 4 here only for callers (tests) that don't pass it explicitly; real jobs
// (jobWorker.js) always pass the job's actual numImages. `productAttributes.color` is threaded
// into the prompt as an explicit product-fidelity lock. Checks CUSTOM_SCENE_MODELS first
// (original 5, untouched logic), then the TEMPLATE-compatible subset of EXTENDED_ALLOWED_MODELS
// (see TEMPLATE_COMPATIBLE_EXTENDED_IDS above) — dual_image models are deliberately never
// reachable here even if somehow assigned to a template's preferredModel, since
// routes/admin/templates.js's own enum already keeps them out; this check is the second,
// defense-in-depth layer.
export async function generateScene({ model, cleanImageUrl, promptTemplate, productAttributes, brandStyleProfile, numImages = 4 }) {
  const sceneConfig = CUSTOM_SCENE_MODELS[model];
  if (sceneConfig) {
    return generateSceneFromCatalog(sceneConfig, { cleanImageUrl, promptTemplate, productAttributes, brandStyleProfile, numImages });
  }

  const extendedConfig = EXTENDED_ALLOWED_MODELS[model];
  if (extendedConfig && TEMPLATE_COMPATIBLE_SHAPES.has(extendedConfig.inputShape)) {
    return generateSceneFromExtendedCatalog(extendedConfig, { cleanImageUrl, promptTemplate, productAttributes, brandStyleProfile, numImages });
  }

  throw new Error(`Unknown scene model: ${model}`);
}

function buildScenePrompt({ promptTemplate, productAttributes, brandStyleProfile }) {
  const lockRules = `Preserve exact product color (${productAttributes?.color ?? 'as shown'}), logo, and label text. Do not alter product shape or proportions.`;
  const stylePrefix = brandStyleProfile
    ? `Match brand visual style: palette ${brandStyleProfile.palette.join(', ')}, tone ${brandStyleProfile.tone}. `
    : '';
  return `${stylePrefix}${lockRules} Scene: ${promptTemplate}`;
}

async function generateSceneFromCatalog(config, { cleanImageUrl, promptTemplate, productAttributes, brandStyleProfile, numImages }) {
  const input = {
    prompt: buildScenePrompt({ promptTemplate, productAttributes, brandStyleProfile }),
    num_images: numImages,
    [config.imageParam]: config.imageParam === 'image_urls' ? [cleanImageUrl] : cleanImageUrl,
  };

  const result = await fal.subscribe(config.endpoint, { input });
  return result.data.images.map((img) => img.url);
}

async function generateSceneFromExtendedCatalog(config, { cleanImageUrl, promptTemplate, productAttributes, brandStyleProfile, numImages }) {
  const prompt = buildScenePrompt({ promptTemplate, productAttributes, brandStyleProfile });

  if (config.inputShape === 'image_urls_prompt') {
    const result = await fal.subscribe(config.endpoint, { input: { prompt, num_images: numImages, image_urls: [cleanImageUrl] } });
    return result.data.images.map((img) => img.url);
  }

  if (config.inputShape === 'image_urls_angles') {
    const result = await fal.subscribe(config.endpoint, {
      input: { image_urls: [cleanImageUrl], additional_prompt: prompt, num_images: numImages },
    });
    return result.data.images.map((img) => img.url);
  }

  // 'image_only' / 'image_and_prompt' — no native batch parameter, so produce the requested
  // batch by calling the endpoint numImages times in parallel, same as generateCustomScene's
  // equivalent loop.
  const input = config.inputShape === 'image_and_prompt' ? { image_url: cleanImageUrl, prompt } : { image_url: cleanImageUrl };
  const results = await Promise.all(Array.from({ length: numImages }, () => fal.subscribe(config.endpoint, { input })));
  return results.map((result) => extractUrl(result, config.outputField));
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
// to EXTENDED_ALLOWED_MODELS (the 11 newer models with more varied request/response shapes).
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

// Used only inside the "call the endpoint once per requested image" loops below (image_only /
// image_and_prompt shapes) — each call is expected to produce exactly one result, whether the
// endpoint's own response shape is a singular `image` or a 1-element `images` array.
function extractUrl(result, outputField) {
  return outputField === 'image' ? result.data.image.url : result.data.images[0].url;
}

async function generateFromExtendedCatalog(config, model, { cleanImageUrls, prompt, numImages }) {
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
