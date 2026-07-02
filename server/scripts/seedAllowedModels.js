// Populates the `allowed_models` Firestore collection — the platform-admin-managed catalog of
// FAL models a merchant may pick directly for custom-prompt generation (see
// routes/admin/models.js, routes/api/models.js, services/fal.js's CUSTOM_SCENE_MODELS). Safe to
// re-run — upsert, not insert.
//
// Every falModel here was verified live against fal.ai's real schema (get_model_schema) to
// accept a genuine reference-image parameter, and priced from real fal.ai pricing data
// (get_pricing) — not guessed. Credit costs are set so every model stays profitable even at the
// Pro pack's bulk rate ($69/600 credits = $0.115/credit, the lowest revenue-per-credit across
// all packs): see admin/src/components/ModelForm.jsx's margin calculator for the live math.
//
// Imagen 4 is deliberately absent — verified to have zero image-input parameters (pure
// text-to-image), which silently discarded any product photo sent to it. Do not re-add it here.
import { allowedModelsRepo } from '../src/models/allowedModelsRepo.js';

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

// Extended catalog — the 10-feature AI model registry (services/aiFeatureModels.js) restructured
// as 15 individually-selectable Allowed Models (Allowed Models has no automatic-fallback concept,
// so each fallback becomes its own standalone option). See services/fal.js's
// EXTENDED_ALLOWED_MODELS doc comment for each model's real request-shape limitations —
// several are text-only (ignore any selected image), one needs exactly 2 images, one needs a
// mask this app's UI can't create yet. Credit costs still target profitability at the Pro pack's
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
    creditCost: 1, // real cost $0.08/image
    supportsMultiImage: true,
  },
  {
    id: 'gpt-image-2-banner',
    falModel: 'gpt-image-2-banner',
    label: 'GPT Image 2 (Banner/Text) — text-only',
    creditCost: 9, // real cost $1.00/image — highest-cost model in the catalog by far
    supportsMultiImage: false,
  },
  {
    id: 'ideogram-v4-banner',
    falModel: 'ideogram-v4-banner',
    label: 'Ideogram V4 (Banner/Text, budget) — text-only',
    creditCost: 1, // real cost $0.01/image
    supportsMultiImage: false,
  },
  {
    id: 'flux-schnell-scene',
    falModel: 'flux-schnell-scene',
    label: 'FLUX Schnell (fast, budget) — text-only',
    creditCost: 1, // ~$0.003/image (per-megapixel, estimated)
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
    label: 'FASHN Virtual Try-On (requires 2 images: person, then garment)',
    creditCost: 1, // real cost $0.075/image
    supportsMultiImage: true,
  },
  {
    id: 'bria-eraser',
    falModel: 'bria-eraser',
    label: 'Bria Eraser (Watermark/Object Removal) — needs a mask, not usable yet',
    creditCost: 1, // real cost $0.04/image
    supportsMultiImage: false,
    active: false, // requires a mask this app's UI cannot create — kept inactive until that exists
  },
  {
    id: 'qwen-multi-angle',
    falModel: 'qwen-multi-angle',
    label: 'Qwen Multi-Angle Shots (fixed default angle)',
    creditCost: 1, // ~$0.035/image (per-megapixel, estimated)
    supportsMultiImage: true,
  },
  {
    id: 'flux-lora-brand',
    falModel: 'flux-lora-brand',
    label: 'FLUX LoRA (Brand Assets) — text-only, no trained brand LoRA yet',
    creditCost: 1, // ~$0.035/image (per-megapixel, estimated)
    supportsMultiImage: false,
  },
  {
    id: 'krea-2-lora-brand',
    falModel: 'krea-2-lora-brand',
    label: 'Krea 2 Turbo LoRA (Brand Assets, budget) — text-only, no trained brand LoRA yet',
    creditCost: 1, // ~$0.01/image (per-megapixel, estimated)
    supportsMultiImage: false,
  },
].map((m) => ({ active: true, ...m, category: 'scene' }));

async function main() {
  const all = [...SCENE_MODELS, ...EXTENDED_MODELS];
  for (const { id, ...data } of all) {
    await allowedModelsRepo.upsert(id, data);
    // eslint-disable-next-line no-console
    console.log(`Seeded allowed model: ${id}`);
  }
  // eslint-disable-next-line no-console
  console.log(`Done — seeded ${all.length} allowed models.`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to seed allowed models:', error);
  process.exit(1);
});
