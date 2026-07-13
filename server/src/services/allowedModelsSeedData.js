// Single source of truth for the `allowed_models` Firestore collection's contents — the
// platform-admin-managed catalog of FAL models a merchant may pick directly for custom-prompt
// generation (see routes/admin/models.js, routes/api/models.js, services/fal.js's
// CUSTOM_SCENE_MODELS). Used by both scripts/seedAllowedModels.js (CLI, needs Shell access on
// Render) and routes/admin/seed.js (a plain HTTP endpoint for admins on a Render plan without
// Shell) — kept here, in src/, rather than in scripts/, so neither has to import from the other.
//
// Every falModel here was verified live against fal.ai's real schema (get_model_schema) to
// accept a genuine reference-image parameter, and priced from real fal.ai pricing data
// (get_pricing) — not guessed. Credit costs are set so every model stays profitable even at the
// Pro pack's bulk rate ($69/600 credits = $0.115/credit, the lowest revenue-per-credit across
// all packs): see admin/src/components/ModelForm.jsx's margin calculator for the live math.
//
// Imagen 4 was originally rejected here for having zero image-input parameters (pure
// text-to-image), which would silently discard any product photo sent to it — that reasoning
// still applies to every image-editing model below. It's re-added below as `imagen4-preview`,
// alongside 3 other genuine text-to-image models (fal.js's TEXT_TO_IMAGE_MODELS) — a deliberately
// different feature for merchants generating a scene from scratch with no product photo at all,
// not a repeat of the original mistake.
import { allowedModelsRepo } from '../models/allowedModelsRepo.js';

const SCENE_MODELS = [
  {
    id: 'flux-kontext-max',
    falModel: 'flux-kontext-max',
    label: 'FLUX Kontext Max',
    creditCost: 2, // real cost $0.08/image; margin at 2cr: 65-78%
    supportsMultiImage: true,
  },
  {
    id: 'flux-kontext-pro',
    falModel: 'flux-kontext-pro',
    label: 'FLUX Kontext Pro',
    creditCost: 1, // real cost $0.04/image; margin at 1cr: 65-78%
    supportsMultiImage: true,
  },
  {
    id: 'seedream-v4-edit',
    falModel: 'seedream-v4-edit',
    label: 'Seedream V4 Edit (budget)',
    creditCost: 1, // real cost $0.03/image; margin at 1cr: 74-83%
    supportsMultiImage: true,
  },
  {
    id: 'nano-banana',
    falModel: 'nano-banana',
    label: 'Nano Banana (Gemini 2.5 Flash Image)',
    creditCost: 1, // real cost $0.0398/image; margin at 1cr: 65-78%
    supportsMultiImage: true,
  },
  {
    id: 'nano-banana-pro',
    falModel: 'nano-banana-pro',
    label: 'Nano Banana Pro (premium, up to 4K)',
    creditCost: 3, // real cost $0.15/image; margin at 3cr: 57-72%
    supportsMultiImage: true,
  },
].map((m) => ({ ...m, category: 'scene', active: true }));

// Extended catalog — the AI model registry (services/aiFeatureModels.js) restructured as
// individually-selectable Allowed Models (Allowed Models has no automatic-fallback concept, so
// each fallback becomes its own standalone option). See services/fal.js's EXTENDED_ALLOWED_MODELS
// doc comment for each model's real request-shape limitations — one (fashn-tryon) needs exactly 2
// images, driven by its own dedicated Virtual Try-On flow rather than the generic custom-prompt
// studio. The pure text-to-image brand-asset LoRA models and the mask-required eraser were
// dropped entirely — see fal.js for why. GPT Image 2 and Ideogram V4 use their genuinely
// image-aware edit/image-to-image endpoints here, not the text-only originals that were briefly
// removed and then corrected. Credit costs still target profitability at the Pro pack's
// $0.115/credit floor; several costs are per-megapixel/per-compute-second estimates, not fal's
// own stated per-image price (flagged with "~" in ModelForm.jsx's margin calculator).
const EXTENDED_MODELS = [
  {
    id: 'bria-remove-background',
    falModel: 'bria-remove-background',
    label: 'Bria Background Remove',
    creditCost: 1, // real cost $0.018/image
    supportsMultiImage: false,
  },
  {
    id: 'birefnet',
    falModel: 'birefnet',
    label: 'BiRefNet Background Remove (budget)',
    creditCost: 1, // ~$0.0025/image (per-compute-second, estimated)
    supportsMultiImage: false,
  },
  {
    id: 'bria-extract-object',
    falModel: 'bria-extract-object',
    label: 'Bria Extract Object (Product Cutout)',
    creditCost: 1, // real cost $0.02/image
    supportsMultiImage: false,
  },
  {
    id: 'rembg',
    falModel: 'rembg',
    label: 'Rembg Background Remove (budget)',
    creditCost: 1, // ~$0.003/image (per-compute-second, estimated)
    supportsMultiImage: false,
  },
  {
    id: 'gemini-3-1-flash-retouch',
    falModel: 'gemini-3-1-flash-retouch',
    label: 'Gemini 3.1 Flash Image (Retouch/Enhance)',
    creditCost: 2, // real cost $0.08/image; creditCost 1 left this the ONLY sub-50%-margin model at
    // the Pro pack's $0.115/credit rate (30% worst-case) — bumped to restore the >=50% floor.
    supportsMultiImage: true,
  },
  {
    id: 'gpt-image-2-banner',
    falModel: 'gpt-image-2-banner',
    label: 'GPT Image 2 (Banner/Text Edit) — attach image(s) + prompt',
    creditCost: 18, // real cost $1.00/image — highest-cost model in the catalog by far. creditCost
    // 9 priced this at ~3.4% margin (razor-thin, effectively break-even after Shopify's revenue
    // share/payment overhead) if a merchant spent an entire Pro pack on it; 18 restores >=50%.
    supportsMultiImage: true,
  },
  {
    id: 'ideogram-v4-banner',
    falModel: 'ideogram-v4-banner',
    label: 'Ideogram V4 (Banner/Text Edit, budget) — attach an image + prompt',
    creditCost: 1, // real cost $0.01/image
    supportsMultiImage: false,
  },
  {
    id: 'topaz-upscale',
    falModel: 'topaz-upscale',
    label: 'Topaz Upscale',
    creditCost: 1, // ~$0.04/image (per-megapixel, estimated for a 2x upscale)
    supportsMultiImage: false,
  },
  {
    id: 'seedvr-upscale',
    falModel: 'seedvr-upscale',
    label: 'SeedVR2 Upscale (budget)',
    creditCost: 1, // ~$0.004/image (per-megapixel, estimated for a 2x upscale)
    supportsMultiImage: false,
  },
  {
    id: 'fashn-tryon',
    falModel: 'fashn-tryon',
    label: 'FASHN Virtual Try-On (person + garment — see the Virtual Try-On page)',
    creditCost: 2, // real cost $0.075/image; creditCost 1 was under the 50%-margin floor at the
    // Pro pack's rate (35% worst-case) — bumped to restore it, same reasoning as gemini-3-1-flash-retouch.
    supportsMultiImage: true,
  },
  {
    id: 'qwen-multi-angle',
    falModel: 'qwen-multi-angle',
    label: 'Qwen Multi-Angle Shots (fixed default angle)',
    creditCost: 1, // ~$0.035/image (per-megapixel, estimated)
    supportsMultiImage: true,
  },
  // Text-to-image models (fal.js's TEXT_TO_IMAGE_MODELS) — no image input at all, verified live
  // to have zero image_url/image_urls param. supportsMultiImage is meaningless for these (no
  // image slot to combine multiple references into) and left false; the custom-prompt UI hides
  // its image-attach control for them entirely based on getImageCountConstraint, not this flag.
  {
    id: 'ideogram-v4-text',
    falModel: 'ideogram-v4-text',
    label: 'Ideogram V4 (text-to-image, budget)',
    creditCost: 1, // real cost $0.01/image; margin at 1cr: 91-94%
    supportsMultiImage: false,
  },
  {
    id: 'imagen4-preview',
    falModel: 'imagen4-preview',
    label: 'Google Imagen 4 (preview)',
    creditCost: 1, // real cost $0.04/image; margin at 1cr: 65-78%
    supportsMultiImage: false,
  },
  {
    id: 'flux-schnell',
    falModel: 'flux-schnell',
    label: 'FLUX.1 [schnell] (fastest/cheapest)',
    creditCost: 1, // ~$0.0024/image (per-megapixel at default 1024x768); margin at 1cr: 98%+
    supportsMultiImage: false,
  },
  {
    id: 'recraft-v3-text',
    falModel: 'recraft-v3-text',
    label: 'Recraft V3 (design/vector styles)',
    creditCost: 2, // real cost $0.04-0.08/image (2x for vector styles, worst-cased); margin at 2cr: 65-78%
    supportsMultiImage: false,
  },
  // Added in a later pass — same verification standard (get_model_schema + get_pricing checked
  // live, not guessed). All 5 confirmed to take only {prompt, num_images} and return an `images`
  // array, so fal.js's generateTextToImage needs no new branching to support them.
  {
    id: 'seedream-v5-pro-text',
    falModel: 'seedream-v5-pro-text',
    label: 'Seedream 5.0 Pro (text-to-image, latest)',
    creditCost: 2, // real cost $0.0675/image; creditCost 1 was under the 50%-margin floor (41%) —
    // bumped to restore it, same reasoning as gemini-3-1-flash-retouch.
    supportsMultiImage: false,
  },
  {
    id: 'gemini-3-pro-text',
    falModel: 'gemini-3-pro-text',
    label: 'Gemini 3 Pro Image (text-to-image, premium)',
    creditCost: 3, // real cost $0.15/image at default 1K res — identical cost/margin math to the
    // already-seeded nano-banana-pro (its image-editing sibling): 3cr, 57-72% margin.
    supportsMultiImage: false,
  },
  {
    id: 'qwen-image-text',
    falModel: 'qwen-image-text',
    label: 'Qwen Image (text-to-image, budget)',
    creditCost: 1, // ~$0.0157/image (per-megapixel, estimated at the ~0.8MP default size); margin at 1cr: 86%+
    supportsMultiImage: false,
  },
  {
    id: 'flux-2-text',
    falModel: 'flux-2-text',
    label: 'FLUX.2 [dev] (text-to-image)',
    creditCost: 1, // ~$0.0084/image (per-compute-second, estimated for a ~5s generation); margin at 1cr: 92%+
    supportsMultiImage: false,
  },
  {
    id: 'grok-imagine-text',
    falModel: 'grok-imagine-text',
    label: 'Grok Imagine (text-to-image)',
    creditCost: 1, // real cost $0.02/image at 1K res; margin at 1cr: 82%+
    supportsMultiImage: false,
  },
].map((m) => ({ active: true, ...m, category: 'scene' }));

export const ALL_SEED_MODELS = [...SCENE_MODELS, ...EXTENDED_MODELS];

// Upserts every model above into Firestore. Safe to re-run any number of times — upsert, not
// insert, so it never duplicates or errors on a model that's already there.
export async function seedAllowedModels() {
  const seededIds = [];
  for (const { id, ...data } of ALL_SEED_MODELS) {
    await allowedModelsRepo.upsert(id, data);
    seededIds.push(id);
  }
  return { count: seededIds.length, ids: seededIds };
}
