import { shopify, BILLING_PLANS } from '../config/shopify.js';
import { addCredits } from './creditLedger.js';
import { shopsRepo } from '../models/shopsRepo.js';

export class UnknownPackError extends Error {
  constructor(packId) {
    super(`Unknown packId: ${packId}`);
    this.name = 'UnknownPackError';
    this.statusCode = 400;
  }
}

// Credits/price per pack (spec Section 12) — kept separate from BILLING_PLANS (config/shopify.js),
// which only carries what Shopify's billing API needs (price/interval), not what we grant for it.
const CREDIT_PACKS = {
  starter: { credits: 50, amountUSD: 9 },
  growth: { credits: 200, amountUSD: 29 },
  pro: { credits: 600, amountUSD: 69 },
};

const UNLIMITED_PLAN_NAME = 'unlimited';
const IMAGE_OPTIMIZER_ADDON_PLAN_NAME = 'image_optimizer_addon';

// POST /api/billing/purchase — returns a confirmationUrl the merchant is redirected to. Nothing
// is credited here; that only happens once Shopify confirms the charge (see reconcileBillingState).
export async function createOneTimePurchase({ session, packId, returnUrl, isTest = false }) {
  if (!CREDIT_PACKS[packId]) throw new UnknownPackError(packId);
  const { confirmationUrl } = await shopify.api.billing.request({
    session,
    plan: packId,
    isTest,
    returnUrl,
    returnObject: true,
  });
  return confirmationUrl;
}

// POST /api/billing/subscribe
export async function createSubscription({ session, returnUrl, isTest = false }) {
  const { confirmationUrl } = await shopify.api.billing.request({
    session,
    plan: UNLIMITED_PLAN_NAME,
    isTest,
    returnUrl,
    returnObject: true,
  });
  return confirmationUrl;
}

// POST /api/image-optimizer/billing/subscribe — separate $2.99/mo add-on, independent of the
// generation-credits plan above. trialDays lives on the static BILLING_PLANS config entry itself
// (config/shopify.js), not passed here.
export async function createImageOptimizerSubscription({ session, returnUrl, isTest = false }) {
  const { confirmationUrl } = await shopify.api.billing.request({
    session,
    plan: IMAGE_OPTIMIZER_ADDON_PLAN_NAME,
    isTest,
    returnUrl,
    returnObject: true,
  });
  return confirmationUrl;
}

// GET /api/billing/confirm — Shopify redirects here after the merchant approves or declines a
// charge, without saying which one. Re-checking current billing state and reconciling against
// whatever is now ACTIVE is the only reliable way to know what happened; addCredits() is
// idempotent on shopifyChargeId, so revisiting this page never double-credits.
export async function reconcileBillingState({ session, isTest = false }) {
  const { oneTimePurchases, appSubscriptions } = await shopify.api.billing.check({
    session,
    plans: Object.keys(BILLING_PLANS),
    isTest,
    returnObject: true,
  });

  const creditedPacks = [];
  for (const purchase of oneTimePurchases) {
    if (purchase.status !== 'ACTIVE') continue;
    const pack = CREDIT_PACKS[purchase.name];
    if (!pack) continue;
    const { alreadyCredited } = await addCredits({
      shopDomain: session.shop,
      creditsAdded: pack.credits,
      amountUSD: pack.amountUSD,
      type: 'one_time_pack',
      packId: purchase.name,
      shopifyChargeId: purchase.id,
    });
    creditedPacks.push({ packId: purchase.name, alreadyCredited });
  }

  const activeSubscription = appSubscriptions.find(
    (sub) => sub.status === 'ACTIVE' && sub.name === UNLIMITED_PLAN_NAME,
  );
  if (activeSubscription) {
    await shopsRepo.updatePlan(session.shop, 'unlimited');
  }

  const activeImageOptimizerAddon = appSubscriptions.find(
    (sub) => sub.status === 'ACTIVE' && sub.name === IMAGE_OPTIMIZER_ADDON_PLAN_NAME,
  );
  if (activeImageOptimizerAddon) {
    await shopsRepo.updateImageOptimizerAddon(session.shop, true);
  }

  return {
    creditedPacks,
    unlimited: Boolean(activeSubscription),
    imageOptimizerAddon: Boolean(activeImageOptimizerAddon),
  };
}

export async function cancelSubscription({ session, subscriptionId, planName, isTest = false }) {
  await shopify.api.billing.cancel({ session, subscriptionId, isTest });
  if (planName === IMAGE_OPTIMIZER_ADDON_PLAN_NAME) {
    await shopsRepo.updateImageOptimizerAddon(session.shop, false);
  } else {
    await shopsRepo.updatePlan(session.shop, 'free');
  }
}
