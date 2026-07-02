import { shopify } from '../config/shopify.js';
import { addCredits } from './creditLedger.js';
import { shopsRepo } from '../models/shopsRepo.js';
import { estimateCustomCredits, getModelImageEstimates } from './creditPricing.js';

export class UnknownPackError extends Error {
  constructor(packId) {
    super(`Unknown packId: ${packId}`);
    this.name = 'UnknownPackError';
    this.statusCode = 400;
  }
}

// Credits granted per pack (spec Section 12) — kept separate from BILLING_PLANS (config/shopify.js),
// which only carries what Shopify's billing API needs (price/interval), not what we grant for it.
// Packs are monthly recurring subscriptions (BillingInterval.Every30Days): this same amount is
// granted again automatically on every renewal (see reconcileBillingState below), and since
// creditBalance is a running total that never resets or expires, unused credits simply carry over
// into the next month — merchants keep whatever they didn't spend.
export const CREDIT_PACKS = {
  starter: { credits: 50, amountUSD: 9 },
  growth: { credits: 200, amountUSD: 29 },
  pro: { credits: 600, amountUSD: 69 },
};
export const PACK_PLAN_NAMES = Object.keys(CREDIT_PACKS);

// The Unlimited subscription tier was retired as a purchasable plan (no more new subscribers),
// but this name is kept so reconcileBillingState/cancelSubscription still correctly recognize
// and handle any subscription that was created before the retirement — ripping it out entirely
// would silently strand whichever shop still has one active.
const UNLIMITED_PLAN_NAME = 'unlimited';
const IMAGE_OPTIMIZER_ADDON_PLAN_NAME = 'image_optimizer_addon';

// One-time purchases created with this exact name pattern are custom credit amounts (see
// createCustomCreditPurchase below) rather than one of the fixed CREDIT_PACKS — Shopify's
// appPurchaseOneTimeCreate has no notion of "arbitrary quantity," so the credit count actually
// purchased is encoded directly in the charge's name and parsed back out at reconcile time.
const CUSTOM_CREDIT_PURCHASE_NAME = (credits) => `Custom credits (${credits})`;
const CUSTOM_CREDIT_PURCHASE_PATTERN = /^Custom credits \((\d+)\)$/;

const APP_PURCHASE_ONE_TIME_CREATE_MUTATION = `#graphql
  mutation AppPurchaseOneTimeCreate($name: String!, $price: MoneyInput!, $returnUrl: URL!, $test: Boolean) {
    appPurchaseOneTimeCreate(name: $name, price: $price, returnUrl: $returnUrl, test: $test) {
      confirmationUrl
      userErrors { field message }
    }
  }
`;

// POST /api/billing/purchase — subscribes the shop to a monthly recurring credit pack, returning
// a confirmationUrl the merchant is redirected to. Nothing is credited here; that only happens
// once Shopify confirms the subscription (see reconcileBillingState), and again automatically on
// every 30-day renewal after that.
export async function createPackSubscription({ session, packId, returnUrl, isTest = false }) {
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

// GET /api/billing/custom-purchase/estimate?amountUSD=20 — the same credit math used at actual
// purchase time below, so the live preview the merchant types against is never wrong by the time
// they click Buy. Deliberately returns only `credits` and the per-model image breakdown, never
// pricePerCredit/marginPct — those are internal, admin-only pricing-strategy figures with no
// reason to reach a merchant's browser (not even in the raw API response, since anyone can open
// devtools regardless of what the UI renders).
export async function previewCustomCreditPurchase(amountUSD) {
  const { credits } = await estimateCustomCredits(amountUSD);
  const modelEstimates = await getModelImageEstimates(credits);
  return { credits, modelEstimates };
}

// POST /api/billing/custom-purchase — lets a merchant buy any dollar amount of credits (within
// sane bounds) rather than only the 3 fixed packs. shopify.api.billing.request()'s convenience
// wrapper only supports pre-declared, fixed-price plans (config/shopify.js's BILLING_PLANS), so
// this calls appPurchaseOneTimeCreate directly with a merchant-chosen price instead — same
// pattern as the hand-rolled GraphQL calls in publish.js/shopifyMediaReplace.js.
export async function createCustomCreditPurchase({ session, amountUSD, returnUrl, isTest = false }) {
  // pricePerCredit is used only to derive `credits` here — never returned to the caller (this
  // response reaches the merchant's browser), same reasoning as previewCustomCreditPurchase above.
  const { credits } = await estimateCustomCredits(amountUSD);

  const client = new shopify.api.clients.Graphql({ session });
  const response = await client.request(APP_PURCHASE_ONE_TIME_CREATE_MUTATION, {
    variables: {
      name: CUSTOM_CREDIT_PURCHASE_NAME(credits),
      price: { amount: amountUSD, currencyCode: 'USD' },
      returnUrl,
      test: isTest,
    },
  });

  const { confirmationUrl, userErrors } = response.data.appPurchaseOneTimeCreate;
  if (userErrors.length > 0) {
    throw new Error(userErrors.map((e) => e.message).join(' '));
  }

  return { confirmationUrl, credits };
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
// whatever is now ACTIVE is the only reliable way to know what happened. Also called opportunistically
// (throttled) from GET /api/credits — see routes/api/credits.js — so a pack's monthly renewal gets
// credited the next time the merchant opens the app, without needing a webhook or a new checkout.
export async function reconcileBillingState({ session, isTest = false }) {
  // Deliberately NOT passing `plans` here — shopify-api's billing.check() filters
  // oneTimePurchases/appSubscriptions to only those whose name is in `plans` when it's provided,
  // which would silently exclude every custom credit purchase (their names are dynamic, e.g.
  // "Custom credits (87)", not a fixed plan key). Every purchase/subscription this app creates is
  // still individually recognized and handled by name below, so nothing else changes.
  const { oneTimePurchases, appSubscriptions } = await shopify.api.billing.check({
    session,
    isTest,
    returnObject: true,
  });

  const creditedPacks = [];

  // Custom credit amounts remain one-time purchases — Shopify's billing API has no notion of an
  // "arbitrary quantity" subscription. The 3 fixed packs used to live here too before they became
  // recurring; this loop is kept only for custom purchases now, plus any legacy one-time pack
  // purchase made before the switch (which stays ACTIVE forever and was already credited once).
  for (const purchase of oneTimePurchases) {
    if (purchase.status !== 'ACTIVE') continue;

    const legacyPack = CREDIT_PACKS[purchase.name];
    if (legacyPack) {
      const { alreadyCredited } = await addCredits({
        shopDomain: session.shop,
        creditsAdded: legacyPack.credits,
        amountUSD: legacyPack.amountUSD,
        type: 'one_time_pack',
        packId: purchase.name,
        shopifyChargeId: purchase.id,
      });
      creditedPacks.push({ packId: purchase.name, alreadyCredited });
      continue;
    }

    const customMatch = purchase.name.match(CUSTOM_CREDIT_PURCHASE_PATTERN);
    if (customMatch) {
      const { alreadyCredited } = await addCredits({
        shopDomain: session.shop,
        creditsAdded: Number(customMatch[1]),
        amountUSD: null, // Shopify is the source of truth for the actual charge; not re-derived here
        type: 'custom_credit_purchase',
        packId: purchase.name,
        shopifyChargeId: purchase.id,
      });
      creditedPacks.push({ packId: purchase.name, alreadyCredited });
    }
  }

  let activePackSubscription = null;
  for (const sub of appSubscriptions) {
    if (sub.status !== 'ACTIVE') continue;

    const pack = CREDIT_PACKS[sub.name];
    if (!pack) continue;

    activePackSubscription = sub;
    // A subscription's `id` is permanent for its whole lifetime, but `currentPeriodEnd` advances
    // every time Shopify renews it — folding both into the idempotency key means this exact same
    // call, re-run on every reconcile (including the throttled one on every app open), is a no-op
    // until Shopify actually starts a new billing period, at which point addCredits() sees a new
    // key and grants the pack again. No separate "have we billed this period yet" bookkeeping
    // needed — the ledger's own idempotency does it for free.
    const { alreadyCredited } = await addCredits({
      shopDomain: session.shop,
      creditsAdded: pack.credits,
      amountUSD: pack.amountUSD,
      type: 'pack_subscription',
      packId: sub.name,
      shopifyChargeId: `${sub.id}:${sub.currentPeriodEnd}`,
    });
    creditedPacks.push({ packId: sub.name, alreadyCredited, currentPeriodEnd: sub.currentPeriodEnd });
  }

  if (activePackSubscription) {
    await shopsRepo.updatePackSubscription(session.shop, {
      plan: activePackSubscription.name,
      subscriptionId: activePackSubscription.id,
    });
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
    activePackPlan: activePackSubscription?.name ?? null,
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
    if (PACK_PLAN_NAMES.includes(planName)) {
      await shopsRepo.clearPackSubscription(session.shop);
    }
  }
}
