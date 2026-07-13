// CLI wrapper around services/allowedModelsSeedData.js — that file is the actual source of
// truth for the model list; this script exists only so it can also be run as
// `npm run seed:models` on a Render Shell (or locally). See routes/admin/seed.js for the plain
// HTTP equivalent, for Render plans without Shell access.
import { seedAllowedModels } from '../src/services/allowedModelsSeedData.js';

async function main() {
  const { count, ids } = await seedAllowedModels();
  for (const id of ids) {
    // eslint-disable-next-line no-console
    console.log(`Seeded allowed model: ${id}`);
  }
  // eslint-disable-next-line no-console
  console.log(`Done — seeded ${count} allowed models.`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to seed allowed models:', error);
  process.exit(1);
});
