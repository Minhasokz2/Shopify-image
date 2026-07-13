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
      // Real (not simulated) pipeline position — set by jobWorker.js at each actual step, so the
      // review screen's progress UI reflects what's really happening rather than guessing from
      // elapsed time. Null until the worker picks the job up.
      progressStage: null,
      ...data,
    });
  },

  async markProcessing(jobId) {
    await repo.update(jobId, { status: JOB_STATUS.PROCESSING });
  },

  async updateProgressStage(jobId, progressStage) {
    await repo.update(jobId, { progressStage });
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

  // Backfills productId onto a job that was created without one (e.g. from an uploaded image with
  // no catalog product behind it — see services/publish.js's createProductForJob). Once set, the
  // job behaves exactly like any catalog-originated job for every existing feature that reads
  // job.productId (the publish flow, GenerationReview's "Publish to" card, Job History, etc.) —
  // nothing downstream needs to know the product didn't exist at generation time.
  async setProductId(jobId, productId) {
    await repo.update(jobId, { productId });
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
