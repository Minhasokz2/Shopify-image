import { createRepo } from '../lib/createRepo.js';
import { firestore, FieldValue } from '../lib/firestore.js';

const repo = createRepo('jobs');

// How long a claimed-but-not-yet-succeeded job is allowed to go without a heartbeat
// (updateProgressStage below) before another worker is allowed to reclaim it. Exists because
// this app runs the in-process JobWorker with no distributed lock — a Render rolling deploy can
// briefly run the old and new instance's worker at once, and both call resumeFromFirestore() on
// boot. Without a lease, both instances would call the paid generation providers for the same
// job. 10 minutes comfortably exceeds any single provider call in the pipeline.
const LEASE_TIMEOUT_MS = 10 * 60 * 1000;

function claimedAtMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return 0;
}

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

  // Atomic — the single source of truth for "which worker actually gets to run this job",
  // replacing the old unconditional markProcessing(). A pending job is always claimable. A job
  // already marked processing is only reclaimable once its lease (claimedAt, refreshed by
  // updateProgressStage's heartbeat below) has gone stale past LEASE_TIMEOUT_MS — i.e. its
  // original worker is presumed dead, not just slow. Firestore transactions serialize concurrent
  // callers, so if two workers race to claim the same job, only one observes `claimed: true`.
  async claimForProcessing(jobId) {
    const ref = repo.collection().doc(jobId);
    return firestore.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) return { claimed: false };

      const job = doc.data();
      if (job.status === JOB_STATUS.SUCCEEDED) return { claimed: false };

      const hasLiveLease = job.status === JOB_STATUS.PROCESSING && Date.now() - claimedAtMillis(job.claimedAt) < LEASE_TIMEOUT_MS;
      if (hasLiveLease) return { claimed: false };

      tx.update(ref, { status: JOB_STATUS.PROCESSING, claimedAt: FieldValue.serverTimestamp() });
      return { claimed: true };
    });
  },

  // Also refreshes the processing lease (see claimForProcessing above) — a genuinely still-running
  // job keeps reporting stage progress, so its lease never goes stale out from under it.
  async updateProgressStage(jobId, progressStage) {
    await repo.update(jobId, { progressStage, claimedAt: FieldValue.serverTimestamp() });
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
