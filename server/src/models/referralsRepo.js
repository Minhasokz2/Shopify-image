import { createRepo } from '../lib/createRepo.js';
import { FieldValue } from '../lib/firestore.js';

const repo = createRepo('referrals');

export const REFERRAL_STATUS = {
  PENDING: 'pending',
  CONVERTED: 'converted',
};

const COMMISSION_RATE = 0.2; // 20% recurring commission, spec Section 3

export const referralsRepo = {
  collection: repo.collection,

  async create(referralId, { referrerShop, referredShop }) {
    return repo.create(referralId, {
      referrerShop,
      referredShop,
      status: REFERRAL_STATUS.PENDING,
      commissionOwedUSD: 0,
    });
  },

  async recordConversion(referralId, { amountUSD }) {
    await repo.collection().doc(referralId).update({
      status: REFERRAL_STATUS.CONVERTED,
      commissionOwedUSD: FieldValue.increment(amountUSD * COMMISSION_RATE),
      updatedAt: FieldValue.serverTimestamp(),
    });
  },

  async findByReferrer(referrerShop) {
    const snapshot = await repo.collection().where('referrerShop', '==', referrerShop).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },
};
