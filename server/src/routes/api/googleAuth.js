import { Router } from 'express';
import { shopsRepo } from '../../models/shopsRepo.js';
import { buildGoogleAuthUrl } from '../../services/googleAuth.js';
import { signState } from '../../lib/signedState.js';

const router = Router();

// GET /api/auth/google/status — backs the frontend's full-app gate: has this shop completed
// the mandatory Google Sign-In yet?
router.get('/auth/google/status', async (req, res) => {
  const shop = await shopsRepo.getByDomain(req.shopDomain);
  res.json({ verified: Boolean(shop?.googleVerifiedAt), googleEmail: shop?.googleEmail ?? null });
});

// POST /api/auth/google/init — mints the Google authorize URL for the current (already
// session-token-authenticated) shop. The frontend opens this in a popup rather than fetching it,
// since completing OAuth requires a real top-level browser navigation to accounts.google.com.
router.post('/auth/google/init', async (req, res) => {
  const state = signState({ shop: req.shopDomain });
  res.json({ authorizeUrl: buildGoogleAuthUrl(state) });
});

export default router;
