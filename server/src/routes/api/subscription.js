import { Router } from 'express';
import { createSubscription } from '../../services/billing.js';
import { env, isProduction } from '../../config/env.js';

const router = Router();

// POST /api/billing/subscribe — Unlimited tier via AppSubscription. Crediting/plan updates
// happen at GET /api/billing/confirm once Shopify confirms the charge, same as one-time packs.
router.post('/billing/subscribe', async (req, res) => {
  const returnUrl = `${env.SHOPIFY_APP_URL}/api/billing/confirm`;
  const confirmationUrl = await createSubscription({
    session: req.shopSession,
    returnUrl,
    isTest: !isProduction,
  });
  res.json({ confirmationUrl });
});

export default router;
