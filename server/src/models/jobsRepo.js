import { createRepo } from '../lib/createRepo.js';
import { FieldValue } from '../lib/firestore.js';

const repo = createRepo('jobs');

export const JOB_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
};

export const jobsRepo = {
  collection: repo.collection,
  getRef: (jobId) => repo.collection().doc(jobId),

  async getById(jobId) {
    return repo.getById(jobId);
  },

  async create(jobId, data) {
    return repo.create(jobId, {
      status: JOB_STATUS.PENDING,
      variations: [],
      creditsCharged: 0,
      batchId: null,
      publishedAt: null,
      completedAt: null,
      ...data,
    });
  },

  async markProcessing(jobId) {
    await repo.update(jobId, { status: JOB_STATUS.PROCESSING });
  },

  async markSucceeded(jobId, { variations, modelUsed }) {
    await repo.update(jobId, {
      status: JOB_STATUS.SUCCEEDED,
      variations,
      modelUsed,
      completedAt: FieldValue.serverTimestamp(),
    });
  },

  async markFailed(jobId, { errorMessage }) {
    await repo.update(jobId, {
      status: JOB_STATUS.FAILED,
      errorMessage,
      completedAt: FieldValue.serverTimestamp(),
    });
  },

  async markPublished(jobId, variations) {
    await repo.update(jobId, { publishedAt: FieldValue.serverTimestamp(), variations });
  },

  async findByShop(shopDomain, { status, contentType, batchId, limit = 50 } = {}) {
    let query = repo.collection().where('shopDomain', '==', shopDomain);
    if (status) query = query.where('status', '==', status);
    if (contentType) query = query.where('contentType', '==', contentType);
    if (batchId) query = query.where('batchId', '==', batchId);
    query = query.orderBy('createdAt', 'desc').limit(limit);
    const snapshot = await query.get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async findActiveByShop(shopDomain) {
    const snapshot = await repo
      .collection()
      .where('shopDomain', '==', shopDomain)
      .where('status', 'in', [JOB_STATUS.PENDING, JOB_STATUS.PROCESSING])
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async findResumable() {
    const snapshot = await repo
      .collection()
      .where('status', 'in', [JOB_STATUS.PENDING, JOB_STATUS.PROCESSING])
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },
};
