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

async function main() {
  for (const { id, ...data } of SCENE_MODELS) {
    await allowedModelsRepo.upsert(id, data);
    // eslint-disable-next-line no-console
    console.log(`Seeded allowed model: ${id}`);
  }
  // eslint-disable-next-line no-console
  console.log(`Done — seeded ${SCENE_MODELS.length} allowed models.`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to seed allowed models:', error);
  process.exit(1);
});
