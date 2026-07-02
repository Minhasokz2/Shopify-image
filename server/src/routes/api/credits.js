import { Router } from 'express';
import { z } from 'zod';
import { shopsRepo } from '../../models/shopsRepo.js';
import {
  createOneTimePurchase,
  createCustomCreditPurchase,
  previewCustomCreditPurchase,
  reconcileBillingState,
} from '../../services/billing.js';
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

const amountSchema = z.object({ amountUSD: z.coerce.number() });

// GET /api/billing/custom-purchase/estimate?amountUSD=20 — live "N credits for $X" preview as the
// merchant types, computed the same way (and by the same code) as the actual purchase below, so
// the quote is never wrong by the time they click Buy.
router.get('/billing/custom-purchase/estimate', async (req, res) => {
  const { amountUSD } = amountSchema.parse(req.query);
  const estimate = await previewCustomCreditPurchase(amountUSD);
  res.json(estimate);
});

// POST /api/billing/custom-purchase — buy any dollar amount of credits, not just the 3 fixed
// packs. Credited once Shopify confirms the charge, same as POST /api/billing/purchase.
router.post('/billing/custom-purchase', async (req, res) => {
  const { amountUSD } = amountSchema.parse(req.body);
  const returnUrl = `${env.SHOPIFY_APP_URL}/api/billing/confirm`;
  const result = await createCustomCreditPurchase({
    session: req.shopSession,
    amountUSD,
    returnUrl,
    isTest: !isProduction,
  });
  res.json(result);
});

// GET /api/billing/confirm — redirect target after purchase/subscription approval.
router.get('/billing/confirm', async (req, res) => {
  const result = await reconcileBillingState({ session: req.shopSession, isTest: !isProduction });
  res.redirect(`${env.SHOPIFY_APP_URL}/billing?confirmed=${result.creditedPacks.length > 0 || result.unlimited}`);
});

export default router;
