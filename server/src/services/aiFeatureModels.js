import { fal } from './fal.js';

// =============================================================================================
// WHY EVERY FEATURE BELOW HAS A PRIMARY + FALLBACK MODEL (not just a single model)
// =============================================================================================
//
// 1. RELIABILITY AGAINST API FAILURES
//    Third-party AI model APIs (fal.ai) can experience downtime, rate limits, or timeouts —
//    especially premium models like Nano Banana Pro or GPT Image 2 that have higher compute
//    demand and stricter queue limits. Pairing each feature with a cheaper, faster fallback model
//    means a single model outage does not break the feature entirely. The request automatically
//    retries on a different model instead of failing outright.
//
// 2. COST CONTROL AT SCALE
//    Premium models (GPT Image 2, Nano Banana Pro, Topaz Upscale) cost significantly more per
//    call than lighter counterparts (Ideogram v4, Gemini Flash, SeedVR2). The fallback is not
//    just a reliability net — it is also a cost-degradation path. If the primary model fails, the
//    system drops to the cheaper option instead of erroring out, keeping the feature usable
//    without runaway costs.
//
// 3. CONSISTENT ARCHITECTURE ACROSS FEATURES
//    generateVideoWithFallback (services/videoGeneration.js) already established the
//    try-primary-then-fallback shape for this app, just narrowly (2 video models, one specific
//    provider swap). runAiFeatureModel below generalizes that exact same shape — same
//    try/catch/throw-on-double-failure structure — across every feature in this registry, so
//    there's one fallback code path in the whole app, not one per feature.
//
// 4. WHY SOME FEATURES HAVE NO FALLBACK
//    Virtual Try-On, Remove Watermark/Object, and Multi-Angle Shots have no comparable
//    alternative model in the fal.ai catalog with similar quality or capability. Forcing a
//    mismatched fallback (e.g. a generic edit model standing in for virtual try-on) would produce
//    broken or nonsensical output rather than a graceful degradation — these three intentionally
//    behave like any other no-fallback entry: fail directly, no auto-retry on a second model.
//
// -------------------------------------------------------------------------------------------
// SCOPE NOTE: this is a registry + a generic runner only — no route, page, or admin UI in this
// app calls runAiFeatureModel yet. None of these 10 features are reachable by a merchant today;
// this is groundwork for whichever of them gets built into an actual feature next.
//
// VERIFICATION NOTE: every endpoint_id below was checked live against fal.ai's real schema
// (get_model_schema) before being added — 3 of the 10 originally-proposed IDs did not resolve
// (wrong endpoint slug) and were corrected to their real IDs:
//   - Product Cutout's primary is `bria/extract-object`, not `fal-ai/bria/extract-object`
//   - Generate Banner's primary is `openai/gpt-image-2`, not `fal-ai/openai/gpt-image-2`
//     (gpt-image-2 lives under fal's `openai/` namespace, not `fal-ai/`)
//   - Generate Banner's fallback is `ideogram/v4`, not `fal-ai/ideogram/v4`
//
// KNOWN RISK, FLAGGED NOT FIXED: Generate Lifestyle Scene's fallback (fal-ai/flux/schnell) is a
// pure text-to-image model with no image-input parameter at all — unlike its primary
// (fal-ai/flux-pro/kontext), which edits the supplied product photo. If this fallback is ever
// actually invoked, the generated "lifestyle scene" will NOT be based on the merchant's product
// image — it'll be an unrelated image matching only the text prompt. This is the same failure
// mode this app already hit once with Imagen 4 (see fal.js's CUSTOM_SCENE_MODELS comment) and
// fixed by removing it from rotation entirely. It's kept here only because it was explicitly
// specified; do not wire this pairing into a live feature without re-deciding whether silently
// dropping product fidelity on fallback is acceptable for that feature.
export const AI_FEATURE_MODELS = {
  remove_background: {
    label: 'Remove Background',
    primary: 'fal-ai/bria/background/remove',
    fallback: 'fal-ai/birefnet',
  },
  product_cutout: {
    label: 'Product Cutout (Isolate Object)',
    primary: 'bria/extract-object',
    fallback: 'fal-ai/imageutils/rembg',
  },
  retouch_enhance: {
    label: 'Retouch/Enhance Product Photo',
    primary: 'fal-ai/nano-banana-pro/edit',
    fallback: 'fal-ai/gemini-3.1-flash-image-preview/edit',
  },
  generate_banner: {
    label: 'Generate Banner with Text',
    primary: 'openai/gpt-image-2',
    fallback: 'ideogram/v4',
  },
  generate_lifestyle_scene: {
    label: 'Generate Lifestyle Scene',
    primary: 'fal-ai/flux-pro/kontext',
    fallback: 'fal-ai/flux/schnell',
  },
  upscale_image: {
    label: 'Upscale Low-Res Image',
    primary: 'fal-ai/topaz/upscale/image',
    fallback: 'fal-ai/seedvr/upscale/image',
  },
  virtual_tryon: {
    label: 'Virtual Try-On (Apparel)',
    primary: 'fal-ai/fashn/tryon/v1.6',
    fallback: null,
  },
  remove_watermark: {
    label: 'Remove Watermark/Object',
    primary: 'fal-ai/bria/eraser',
    fallback: null,
  },
  multi_angle_shots: {
    label: 'Multi-Angle Product Shots',
    primary: 'fal-ai/qwen-image-edit-2511-multiple-angles',
    fallback: null,
  },
  brand_consistent_assets: {
    label: 'Brand-Consistent Assets',
    primary: 'fal-ai/flux-lora',
    fallback: 'fal-ai/krea-2/turbo/lora',
  },
};

export class AiFeatureModelError extends Error {
  constructor(featureKey, primaryError, fallbackError) {
    super(
      fallbackError
        ? `AI feature "${featureKey}" failed on both the primary and fallback model`
        : `AI feature "${featureKey}" failed (no fallback model configured)`,
    );
    this.name = 'AiFeatureModelError';
    this.featureKey = featureKey;
    this.primaryError = primaryError;
    this.fallbackError = fallbackError ?? null;
  }
}

// Same try-primary-then-fallback shape as generateVideoWithFallback (services/videoGeneration.js),
// generalized across every feature in AI_FEATURE_MODELS instead of being hardcoded to 2 video
// models. `input` is passed to both the primary and fallback call as-is — this only works because
// every pairing above (except the flagged one) accepts a compatible input shape; it does not
// adapt parameter names per model the way generateCustomScene does for the scene catalog.
export async function runAiFeatureModel(featureKey, input) {
  const entry = AI_FEATURE_MODELS[featureKey];
  if (!entry) throw new Error(`Unknown AI feature: ${featureKey}`);

  try {
    return await fal.subscribe(entry.primary, { input });
  } catch (primaryError) {
    if (!entry.fallback) {
      throw new AiFeatureModelError(featureKey, primaryError);
    }
    try {
      return await fal.subscribe(entry.fallback, { input });
    } catch (fallbackError) {
      throw new AiFeatureModelError(featureKey, primaryError, fallbackError);
    }
  }
}
