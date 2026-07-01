// Populates the `allowed_models` Firestore collection — the platform-admin-managed catalog of
// FAL models a merchant may pick directly for custom-prompt generation (see
// routes/admin/models.js, routes/api/models.js). Safe to re-run — upsert, not insert.
import { allowedModelsRepo } from '../src/models/allowedModelsRepo.js';

const SCENE_MODELS = [
  {
    id: 'flux-kontext-max',
    label: 'FLUX Kontext Max',
    creditCost: 4,
    supportsMultiImage: true,
  },
  {
    id: 'flux-kontext-pro',
    label: 'FLUX Kontext Pro',
    creditCost: 3,
    supportsMultiImage: true,
  },
  {
    id: 'imagen-4',
    label: 'Imagen 4 (color-accurate)',
    creditCost: 3,
    supportsMultiImage: false,
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
