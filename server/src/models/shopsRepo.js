import crypto from 'node:crypto';
import { createRepo } from '../lib/createRepo.js';
import { FieldValue } from '../lib/firestore.js';

const FREE_TRIAL_CREDITS = 10;

const repo = createRepo('shops');

function generateReferralCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
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
  // ever recorded once, not on every re-auth.
  async ensureShopExists(shopDomain, { referredBy = null } = {}) {
    const ref = repo.collection().doc(shopDomain);
    const doc = await ref.get();
    if (doc.exists) {
      return { id: doc.id, ...doc.data(), isNew: false };
    }
    const data = {
      installedAt: FieldValue.serverTimestamp(),
      creditBalance: FREE_TRIAL_CREDITS,
      plan: 'free',
      brandStyleProfile: null,
      referralCode: generateReferralCode(),
      referredBy,
      nurtureEmailsSent: [],
    };
    await repo.create(shopDomain, data);
    return { id: shopDomain, ...data, isNew: true };
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
