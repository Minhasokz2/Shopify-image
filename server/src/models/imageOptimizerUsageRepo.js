import { createRepo } from '../lib/createRepo.js';

const repo = createRepo('image_optimizer_usage');

// One doc per shop (doc id = shopDomain, same convention as shopsRepo). Kept thin — the actual
// daily-reset-and-increment logic lives in services/imageOptimizerQuota.js as a Firestore
// transaction, the same split used by creditLedger.js/shopsRepo for the credits system.
export const imageOptimizerUsageRepo = {
  collection: repo.collection,
  getRef: (shopDomain) => repo.collection().doc(shopDomain),

  async getById(shopDomain) {
    return repo.getById(shopDomain);
  },
};
