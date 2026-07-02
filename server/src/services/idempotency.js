import { firestore, FieldValue } from '../lib/firestore.js';
import { JOB_STATUS } from '../models/jobsRepo.js';

const KEYS_COLLECTION = 'idempotency_keys';

export class JobNotFoundError extends Error {
  constructor(jobId) {
    super(`Job not found: ${jobId}`);
    this.statusCode = 404;
  }
}

// Client-generated idempotencyKey (spec Section 13/17): a retried "create job" request with the
// same key must never create a second job or place a second credit hold. The claim doc and the
// job doc are written in the same transaction, so a claim can never exist without its job.
export async function claimJobCreation({ shopDomain, idempotencyKey, jobId, jobData }) {
  const claimRef = firestore.collection(KEYS_COLLECTION).doc(`${shopDomain}:${idempotencyKey}`);
  const jobRef = firestore.collection('jobs').doc(jobId);

  return firestore.runTransaction(async (tx) => {
    const claimDoc = await tx.get(claimRef);
    if (claimDoc.exists) {
      return { created: false, jobId: claimDoc.data().jobId };
    }

    tx.set(claimRef, {
      jobId,
      shopDomain,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(jobRef, {
      ...jobData,
      shopDomain,
      status: JOB_STATUS.PENDING,
      variations: [],
      creditsCharged: 0,
      publishedAt: null,
      completedAt: null,
      idempotencyKey,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { created: true, jobId };
  });
}

// Same pattern as claimJobCreation above, targeting conversion_jobs instead of jobs — kept as a
// separate function rather than parameterizing claimJobCreation's collection, since jobData's
// shape (status enum, variations, creditsCharged) is specific to the generation pipeline and
// doesn't apply to a conversion job's fields.
export async function claimConversionJobCreation({ shopDomain, idempotencyKey, jobId, jobData }) {
  const claimRef = firestore.collection(KEYS_COLLECTION).doc(`${shopDomain}:${idempotencyKey}`);
  const jobRef = firestore.collection('conversion_jobs').doc(jobId);

  return firestore.runTransaction(async (tx) => {
    const claimDoc = await tx.get(claimRef);
    if (claimDoc.exists) {
      return { created: false, jobId: claimDoc.data().jobId };
    }

    tx.set(claimRef, {
      jobId,
      shopDomain,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(jobRef, {
      ...jobData,
      shopDomain,
      status: 'queued',
      outputAssets: [],
      originalBytes: null,
      savedBytes: null,
      cloudinaryPublicId: null,
      backupExpiry: null,
      errorMessage: null,
      completedAt: null,
      idempotencyKey,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { created: true, jobId };
  });
}

// Publish idempotency is keyed on the job itself (jobId + "already published"), not a separate
// client-supplied key — a job can only ever be published once, full stop.
//
// `approvedIndices` is the merchant's variation picks from the review screen. There is no
// separate "save my approvals" step in the UI — the checkboxes are purely local React state
// until this call — so the approval is applied to the job doc in the very same transaction that
// claims the publish, and the returned `job.variations` reflects it immediately for the caller
// to filter on, rather than the stale pre-approval array.
export async function claimPublish(jobId, approvedIndices = []) {
  const jobRef = firestore.collection('jobs').doc(jobId);
  const approvedSet = new Set(approvedIndices);

  return firestore.runTransaction(async (tx) => {
    const jobDoc = await tx.get(jobRef);
    if (!jobDoc.exists) throw new JobNotFoundError(jobId);

    const job = jobDoc.data();
    if (job.publishedAt) {
      return { alreadyPublished: true, job: { id: jobId, ...job } };
    }

    const variations = (job.variations ?? []).map((variation, index) => ({
      ...variation,
      approved: approvedSet.has(index),
    }));

    tx.update(jobRef, { publishedAt: FieldValue.serverTimestamp(), variations });
    return { alreadyPublished: false, job: { id: jobId, ...job, variations } };
  });
}

// If the actual Shopify productCreateMedia call fails after the claim above, release the claim
// so a subsequent retry isn't permanently locked out of publishing.
export async function releasePublishClaim(jobId) {
  await firestore.collection('jobs').doc(jobId).update({ publishedAt: null });
}
