import { Router } from 'express';
import { z } from 'zod';
import { shopsRepo } from '../../models/shopsRepo.js';
import { createOneTimePurchase, reconcileBillingState } from '../../services/billing.js';
import { env, isProduction } from '../../config/env.js';

const router = Router();

// GET /api/credits — current balance/plan, backing the Dashboard and CreditBalanceBadge.
router.get('/credits', async (req, res) => {
  const shop = await shopsRepo.getByDomain(req.shopDomain);
  res.json({ creditBalance: shop?.creditBalance ?? 0, plan: shop?.plan ?? 'free' });
});

const purchaseSchema = z.object({ packId: z.enum(['starter', 'growth', 'pro']) });

// POST /api/billing/purchase
router.post('/billing/purchase', async (req, res) => {
  const { packId } = purchaseSchema.parse(req.body);
  const returnUrl = `${env.SHOPIFY_APP_URL}/api/billing/confirm`;
  const confirmationUrl = await createOneTimePurchase({
    session: req.shopSession,
    packId,
    returnUrl,
    isTest: !isProduction,
  });
  res.json({ confirmationUrl });
});

// GET /api/billing/confirm — redirect target after purchase/subscription approval.
router.get('/billing/confirm', async (req, res) => {
  const result = await reconcileBillingState({ session: req.shopSession, isTest: !isProduction });
  res.redirect(`${env.SHOPIFY_APP_URL}/billing?confirmed=${result.creditedPacks.length > 0 || result.unlimited}`);
});

export default router;
