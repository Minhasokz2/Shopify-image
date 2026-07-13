import { Router } from 'express';
import { seedAllowedModels } from '../../services/allowedModelsSeedData.js';

const router = Router();

// POST /admin/api/seed-models — re-runs the allowed-models seed (services/allowedModelsSeedData.js)
// from a plain HTTP request instead of a shell command, for admins on a Render plan without
// Shell access (`npm run seed:models` remains the CLI equivalent). Safe to call repeatedly —
// upsert, not insert, so re-running it never duplicates or errors on a model that's already there.
router.post('/seed-models', async (req, res) => {
  const result = await seedAllowedModels();
  res.status(200).json(result);
});

export default router;
