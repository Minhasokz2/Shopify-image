import { Router } from 'express';
import { allowedModelsRepo } from '../../models/allowedModelsRepo.js';
import { getImageCountConstraint } from '../../services/fal.js';

const router = Router();

// GET /api/models?category=scene — active models a merchant may pick for a custom-prompt
// generation (as opposed to a fixed-prompt template). Inactive models the admin has disabled
// are never returned here, even though they're still visible in the admin's own view.
router.get('/models', async (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : 'scene';
  const models = await allowedModelsRepo.findActiveByCategory(category);
  // `imageCount` is derived from fal.js's model tables (the real source of truth for request
  // shapes) rather than stored on the Firestore doc itself — the admin-editable `supportsMultiImage`
  // flag is too coarse (e.g. it can't distinguish "up to 6" from fashn-tryon's "exactly 2"), and
  // duplicating the real constraint into admin-editable data risks it drifting out of sync with
  // what fal.js actually sends. The frontend uses this to cap how many images a merchant can
  // select/upload for whichever model they pick.
  const modelsWithImageCount = models.map((model) => ({
    ...model,
    // falModel and the Firestore doc id are always the same string in practice (see
    // scripts/seedAllowedModels.js), but fall back to id defensively in case either is ever
    // absent on an older/hand-seeded record.
    imageCount: getImageCountConstraint(model.falModel ?? model.id),
  }));
  // Admin-managed and can change at any moment from a separate app — never let a browser/proxy
  // cache serve a stale catalog to the merchant.
  res.set('Cache-Control', 'no-store');
  res.json({ models: modelsWithImageCount });
});

export default router;
