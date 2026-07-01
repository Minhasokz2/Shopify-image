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
  // the caller whether this was the install that just happened, e.g. so a referral is only
  // ever recorded once, not on every re-auth. `shopEmail` is the shop owner's Shopify-verified
  // email (best-effort — auth.js proceeds without it if the GraphQL lookup fails); when present,
  // the free trial is granted at most once per normalized email, not once per shop domain.
  async ensureShopExists(shopDomain, { referredBy = null, shopEmail = null } = {}) {
    const shopRef = repo.collection().doc(shopDomain);
    const preCheck = await shopRef.get();
    if (preCheck.exists) {
      return { id: preCheck.id, ...preCheck.data(), isNew: false };
    }

    const normalizedEmail = shopEmail ? normalizeTrialEmail(shopEmail) : null;
    const trialEmailRef = normalizedEmail ? firestore.collection(TRIAL_EMAILS_COLLECTION).doc(normalizedEmail) : null;

    return firestore.runTransaction(async (tx) => {
      const doc = await tx.get(shopRef);
      if (doc.exists) {
        return { id: doc.id, ...doc.data(), isNew: false };
      }

      const trialEmailDoc = trialEmailRef ? await tx.get(trialEmailRef) : null;
      const trialCreditsGranted = !trialEmailDoc?.exists;

      const data = {
        installedAt: FieldValue.serverTimestamp(),
        creditBalance: trialCreditsGranted ? FREE_TRIAL_CREDITS : 0,
        plan: 'free',
        brandStyleProfile: null,
        referralCode: generateReferralCode(),
        referredBy,
        nurtureEmailsSent: [],
        shopEmail,
        trialCreditsGranted,
      };
      tx.set(shopRef, data);

      if (trialEmailRef && trialCreditsGranted) {
        tx.set(trialEmailRef, { shopDomain, claimedAt: FieldValue.serverTimestamp() });
      }

      return { id: shopDomain, ...data, isNew: true };
    });
  },

  async markUninstalled(shopDomain) {
    await repo.update(shopDomain, { plan: 'uninstalled', uninstalledAt: FieldValue.serverTimestamp() });
  },

  async updatePlan(shopDomain, plan) {
    await repo.update(shopDomain, { plan });
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
