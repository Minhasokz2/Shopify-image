import { Router } from 'express';
import { z } from 'zod';
import { shopsRepo } from '../../models/shopsRepo.js';
import {
  createPackSubscription,
  createCustomCreditPurchase,
  previewCustomCreditPurchase,
  reconcileBillingState,
  cancelSubscription,
} from '../../services/billing.js';
import { signState } from '../../lib/signedState.js';
import { env, isProduction } from '../../config/env.js';

const router = Router();

// How often GET /api/credits is allowed to re-query Shopify's billing API to detect a pack
// subscription's monthly renewal. Shopify auto-charges renewals silently — there's no redirect
// back into the app for it the way a fresh checkout has — so this is the mechanism that notices
// "a new billing period started" and credits the pack again. Throttled so a route hit on nearly
// every page load doesn't hammer Shopify's API.
const BILLING_RECHECK_INTERVAL_MS = 60 * 60 * 1000;

function isStale(lastCheckedAt) {
  if (!lastCheckedAt) return true;
  const lastCheckedMs = typeof lastCheckedAt.toMillis === 'function' ? lastCheckedAt.toMillis() : new Date(lastCheckedAt).getTime();
  return Date.now() - lastCheckedMs > BILLING_RECHECK_INTERVAL_MS;
}

// GET /api/credits — current balance/plan, backing the Dashboard and CreditBalanceBadge.
router.get('/credits', async (req, res) => {
  let shop = await shopsRepo.getByDomain(req.shopDomain);

  if (shop?.activePackSubscriptionId && isStale(shop.lastBillingCheckAt)) {
    await reconcileBillingState({ session: req.shopSession, isTest: !isProduction });
    await shopsRepo.updateLastBillingCheck(req.shopDomain);
    shop = await shopsRepo.getByDomain(req.shopDomain);
  }

  res.json({
    creditBalance: shop?.creditBalance ?? 0,
    plan: shop?.plan ?? 'free',
    billingInterval: shop?.billingInterval ?? null,
    canCancelPlan: Boolean(shop?.activePackSubscriptionId),
  });
});

const purchaseSchema = z.object({
  packId: z.enum(['starter', 'growth', 'pro']),
  billingInterval: z.enum(['monthly', 'annual']).default('monthly'),
});

// POST /api/billing/purchase — subscribes the shop to a recurring credit pack (monthly or annual).
router.post('/billing/purchase', async (req, res) => {
  const { packId, billingInterval } = purchaseSchema.parse(req.body);
  const returnUrl = `${env.SHOPIFY_APP_URL}/billing/confirm?state=${signState({ shop: req.shopDomain })}`;
  const confirmationUrl = await createPackSubscription({
    session: req.shopSession,
    packId,
    billingInterval,
    returnUrl,
    isTest: !isProduction,
  });
  res.json({ confirmationUrl });
});

// POST /api/billing/cancel — cancels the shop's active credit-pack subscription. Already-granted
// credits are never clawed back; the shop simply stops being billed and stops renewing.
router.post('/billing/cancel', async (req, res) => {
  const shop = await shopsRepo.getByDomain(req.shopDomain);
  if (!shop?.activePackSubscriptionId) {
    return res.status(400).json({ message: 'No active subscription to cancel.' });
  }
  await cancelSubscription({
    session: req.shopSession,
    subscriptionId: shop.activePackSubscriptionId,
    planName: shop.plan,
    isTest: !isProduction,
  });
  res.json({ cancelled: true });
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
  const returnUrl = `${env.SHOPIFY_APP_URL}/billing/confirm?state=${signState({ shop: req.shopDomain })}`;
  const result = await createCustomCreditPurchase({
    session: req.shopSession,
    amountUSD,
    returnUrl,
    isTest: !isProduction,
  });
  res.json(result);
});

export default router;
