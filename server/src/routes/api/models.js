import { Router } from 'express';
import { allowedModelsRepo } from '../../models/allowedModelsRepo.js';

const router = Router();

// GET /api/models?category=scene — active models a merchant may pick for a custom-prompt
// generation (as opposed to a fixed-prompt template). Inactive models the admin has disabled
// are never returned here, even though they're still visible in the admin's own view.
router.get('/models', async (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : 'scene';
  const models = await allowedModelsRepo.findActiveByCategory(category);
  // Admin-managed and can change at any moment from a separate app — never let a browser/proxy
  // cache serve a stale catalog to the merchant.
  res.set('Cache-Control', 'no-store');
  res.json({ models });
});

export default router;
