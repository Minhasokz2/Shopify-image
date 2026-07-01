import { createRepo } from '../lib/createRepo.js';

const repo = createRepo('transactions');

export const transactionsRepo = {
  collection: repo.collection,

  async record(transactionId, { shopDomain, type, packId = null, amountUSD, creditsAdded, shopifyChargeId = null }) {
    return repo.create(transactionId, {
      shopDomain,
      type, // "one_time_pack" | "subscription" | "credit_deduction"
      packId,
      amountUSD,
      creditsAdded,
      shopifyChargeId,
    });
  },

  async findByShop(shopDomain, { limit = 100 } = {}) {
    const snapshot = await repo
      .collection()
      .where('shopDomain', '==', shopDomain)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },
};
