import { createRepo } from '../lib/createRepo.js';
import { FieldValue } from '../lib/firestore.js';

const repo = createRepo('batches');

export const BATCH_STATUS = {
  PROCESSING: 'processing',
  COMPLETE: 'complete',
  PARTIAL_FAILURE: 'partial_failure',
};

export const batchesRepo = {
  collection: repo.collection,
  getRef: (batchId) => repo.collection().doc(batchId),

  async getById(batchId) {
    return repo.getById(batchId);
  },

  async create(batchId, { shopDomain, jobIds }) {
    return repo.create(batchId, {
      shopDomain,
      jobIds,
      status: BATCH_STATUS.PROCESSING,
      totalCount: jobIds.length,
      completedCount: 0,
      failedCount: 0,
    });
  },

  // Atomic increment — safe to call concurrently from multiple job completions without a
  // transaction, since FieldValue.increment() is a server-side atomic operation.
  async recordJobOutcome(batchId, { succeeded }) {
    const ref = repo.collection().doc(batchId);
    await ref.update({
      completedCount: FieldValue.increment(1),
      failedCount: FieldValue.increment(succeeded ? 0 : 1),
      updatedAt: FieldValue.serverTimestamp(),
    });
  },

  async finalizeIfComplete(batchId) {
    const ref = repo.collection().doc(batchId);
    const doc = await ref.get();
    if (!doc.exists) return;
    const data = doc.data();
    if (data.completedCount >= data.totalCount && data.status === BATCH_STATUS.PROCESSING) {
      await ref.update({
        status: data.failedCount > 0 ? BATCH_STATUS.PARTIAL_FAILURE : BATCH_STATUS.COMPLETE,
      });
    }
  },

  async findByShop(shopDomain, { limit = 50 } = {}) {
    const snapshot = await repo
      .collection()
      .where('shopDomain', '==', shopDomain)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },
};
