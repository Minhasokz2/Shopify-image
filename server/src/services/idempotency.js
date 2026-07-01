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

// Publish idempotency is keyed on the job itself (jobId + "already published"), not a separate
// client-supplied key — a job can only ever be published once, full stop.
export async function claimPublish(jobId) {
  const jobRef = firestore.collection('jobs').doc(jobId);

  return firestore.runTransaction(async (tx) => {
    const jobDoc = await tx.get(jobRef);
    if (!jobDoc.exists) throw new JobNotFoundError(jobId);

    const job = jobDoc.data();
    if (job.publishedAt) {
      return { alreadyPublished: true, job: { id: jobId, ...job } };
    }

    tx.update(jobRef, { publishedAt: FieldValue.serverTimestamp() });
    return { alreadyPublished: false, job: { id: jobId, ...job } };
  });
}

// If the actual Shopify productCreateMedia call fails after the claim above, release the claim
// so a subsequent retry isn't permanently locked out of publishing.
export async function releasePublishClaim(jobId) {
  await firestore.collection('jobs').doc(jobId).update({ publishedAt: null });
}
