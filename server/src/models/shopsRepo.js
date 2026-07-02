import crypto from 'node:crypto';
import { createRepo } from '../lib/createRepo.js';
import { firestore, FieldValue } from '../lib/firestore.js';

const FREE_TRIAL_CREDITS = 10;
const TRIAL_EMAILS_COLLECTION = 'used_trial_emails';

const repo = createRepo('shops');

function generateReferralCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// Stops the same person from farming free trial credits across multiple dev stores/shops by
// reinstalling under a fresh shop domain but the same inbox. Gmail ignores dots in the local
// part and treats anything after "+" as a tag, so both tricks are normalized away before the
// email is used as a dedupe key.
export function normalizeTrialEmail(email) {
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex === -1) return trimmed;

  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  const isGmail = domain === 'gmail.com' || domain === 'googlemail.com';
  const normalizedLocal = isGmail ? local.split('+')[0].replaceAll('.', '') : local;
  const normalizedDomain = domain === 'googlemail.com' ? 'gmail.com' : domain;

  return `${normalizedLocal}@${normalizedDomain}`;
}

export const shopsRepo = {
  // Deliberately does NOT store the Shopify access token — the offline session (and its
  // access token) already lives in the `shopify_sessions` collection via FirestoreSessionStorage,
  // which is the single source of truth for it. Duplicating a live secret into a second
  // collection would widen the blast radius of a Firestore rules mistake for no benefit.
  collection: repo.collection,

  async getByDomain(shopDomain) {
    return repo.getById(shopDomain);
  },

  getRef(shopDomain) {
    return repo.collection().doc(shopDomain);
  },

  // Idempotent — safe to call on every OAuth callback, not just first install. `isNew` tells
  // the caller whether this was the install that just happened, e.g. so a referral is only ever
  // recorded once, not on every re-auth. Starts at 0 credits and unverified — the app is fully
  // gated behind Google Sign-In (see routes/googleAuth.js) before any credits are granted or any
  // page loads, so there's nothing to hand out yet at plain Shopify-install time.
  async ensureShopExists(shopDomain, { referredBy = null } = {}) {
    const ref = repo.collection().doc(shopDomain);
    const doc = await ref.get();
    if (doc.exists) {
      return { id: doc.id, ...doc.data(), isNew: false };
    }
    const data = {
      installedAt: FieldValue.serverTimestamp(),
      creditBalance: 0,
      plan: 'free',
      brandStyleProfile: null,
      referralCode: generateReferralCode(),
      referredBy,
      nurtureEmailsSent: [],
      googleVerifiedAt: null,
      googleEmail: null,
      googleId: null,
      trialCreditsGranted: false,
      imageOptimizerAddon: false,
    };
    await repo.create(shopDomain, data);
    return { id: shopDomain, ...data, isNew: true };
  },

  // Called once, from the Google OAuth callback, the first time a shop's Google identity is
  // verified. Marks the shop as unlocked (googleVerifiedAt) regardless of trial eligibility —
  // gating the app on "has a real Google account been verified", not on "did this get free
  // credits" — and separately grants the one-time free trial only if this exact (normalized)
  // Google email hasn't already claimed it under a different shop. A repeat email still
  // unlocks the app; it just starts at 0 credits and goes straight to paid plans.
  async markGoogleVerified(shopDomain, { googleEmail, googleId }) {
    const shopRef = repo.collection().doc(shopDomain);
    const normalizedEmail = normalizeTrialEmail(googleEmail);
    const trialEmailRef = firestore.collection(TRIAL_EMAILS_COLLECTION).doc(normalizedEmail);

    return firestore.runTransaction(async (tx) => {
      const shopDoc = await tx.get(shopRef);
      if (!shopDoc.exists) {
        throw new Error(`Cannot mark Google-verified: shop ${shopDomain} has no record`);
      }
      const shop = shopDoc.data();

      // Re-verifying (e.g. a second staff member signs in) must never re-grant the trial.
      if (shop.googleVerifiedAt) {
        return { id: shopDomain, ...shop, isNew: false };
      }

      const trialEmailDoc = await tx.get(trialEmailRef);
      const trialCreditsGranted = !trialEmailDoc.exists;

      const patch = {
        googleVerifiedAt: FieldValue.serverTimestamp(),
        googleEmail,
        googleId,
        trialCreditsGranted,
        creditBalance: trialCreditsGranted ? shop.creditBalance + FREE_TRIAL_CREDITS : shop.creditBalance,
      };
      tx.update(shopRef, patch);

      if (trialCreditsGranted) {
        tx.set(trialEmailRef, { shopDomain, claimedAt: FieldValue.serverTimestamp() });
      }

      return { id: shopDomain, ...shop, ...patch };
    });
  },

  async markUninstalled(shopDomain) {
    await repo.update(shopDomain, { plan: 'uninstalled', uninstalledAt: FieldValue.serverTimestamp() });
  },

  async updatePlan(shopDomain, plan) {
    await repo.update(shopDomain, { plan });
  },

  // Called from reconcileBillingState whenever a starter/growth/pro subscription is found ACTIVE.
  // `plan` doubles as both the credits plan (used by assertSufficientCredits' unlimited check and
  // shown on Billing.jsx) and the pack id; `activePackSubscriptionId` is kept so the merchant can
  // cancel from within the app without an extra round trip to Shopify to look the id back up.
  async updatePackSubscription(shopDomain, { plan, subscriptionId }) {
    await repo.update(shopDomain, { plan, activePackSubscriptionId: subscriptionId });
  },

  async clearPackSubscription(shopDomain) {
    await repo.update(shopDomain, { activePackSubscriptionId: null });
  },

  // Throttles how often GET /api/credits re-queries Shopify's billing API to detect a pack's
  // monthly renewal — every request would be wasteful and slow; this timestamp lets the route
  // skip the check unless enough time has passed since the last one.
  async updateLastBillingCheck(shopDomain) {
    await repo.update(shopDomain, { lastBillingCheckAt: FieldValue.serverTimestamp() });
  },

  // Separate from `plan` (the credits/unlimited-generation plan) — the Image Optimizer add-on is
  // its own $2.99/mo AppSubscription a shop can hold independently of its generation plan.
  async updateImageOptimizerAddon(shopDomain, active) {
    await repo.update(shopDomain, { imageOptimizerAddon: active });
  },

  async findActiveShops() {
    const snapshot = await repo.collection().where('plan', '!=', 'uninstalled').get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async markNurtureEmailSent(shopDomain, day) {
    await repo.update(shopDomain, { nurtureEmailsSent: FieldValue.arrayUnion(day) });
  },

  async findByReferralCode(referralCode) {
    const snapshot = await repo.collection().where('referralCode', '==', referralCode).limit(1).get();
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  },
};
