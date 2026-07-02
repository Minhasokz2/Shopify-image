import { createRepo } from '../lib/createRepo.js';
import { FieldValue } from '../lib/firestore.js';

const repo = createRepo('conversion_jobs');

export const CONVERSION_STATUS = {
  QUEUED: 'queued',
  PROCESSING: 'processing',
  DONE: 'done',
  FAILED: 'failed',
  RESTORED: 'restored',
};

// One doc per source image being converted (Image Optimizer feature). Mirrors jobsRepo.js's
// shape/conventions deliberately — same shop, same resumable-on-boot pattern — but kept in its
// own collection since a conversion job's fields (input/output format+size, replace target) don't
// overlap with a generation job's (template/model/prompt/variations).
export const conversionJobsRepo = {
  collection: repo.collection,
  getRef: (jobId) => repo.collection().doc(jobId),

  async getById(jobId) {
    return repo.getById(jobId);
  },

  async create(jobId, data) {
    return repo.create(jobId, {
      status: CONVERSION_STATUS.QUEUED,
      // outputAssets is an array, not a single url/size pair, because "Both" (WebP + AVIF) is a
      // valid merchant choice — one conversion job can produce more than one output file.
      outputAssets: [],
      originalBytes: null,
      savedBytes: null,
      cloudinaryPublicId: null,
      backupExpiry: null,
      batchId: null,
      errorMessage: null,
      completedAt: null,
      ...data,
    });
  },

  async markProcessing(jobId) {
    await repo.update(jobId, { status: CONVERSION_STATUS.PROCESSING });
  },

  async markDone(jobId, { outputAssets, originalBytes, savedBytes, cloudinaryPublicId, backupExpiry }) {
    await repo.update(jobId, {
      status: CONVERSION_STATUS.DONE,
      outputAssets,
      originalBytes,
      savedBytes,
      cloudinaryPublicId,
      backupExpiry,
      completedAt: FieldValue.serverTimestamp(),
    });
  },

  async markFailed(jobId, { errorMessage }) {
    await repo.update(jobId, {
      status: CONVERSION_STATUS.FAILED,
      errorMessage,
      completedAt: FieldValue.serverTimestamp(),
    });
  },

  async markRestored(jobId) {
    await repo.update(jobId, { status: CONVERSION_STATUS.RESTORED });
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

  // Crash/redeploy recovery — same rationale as jobsRepo.findResumable(): anything left
  // queued/processing when the process died needs to be picked back up on boot.
  async findResumable() {
    const snapshot = await repo
      .collection()
      .where('status', 'in', [CONVERSION_STATUS.QUEUED, CONVERSION_STATUS.PROCESSING])
      .get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },
};
