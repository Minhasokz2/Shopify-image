import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/firestore.js', async () => {
  const { createFakeFirestore } = await import('../helpers/fakeFirestore.js');
  const fake = createFakeFirestore();
  return { firestore: fake.firestore, FieldValue: fake.FieldValue, Timestamp: {} };
});

const { firestore } = await import('../../src/lib/firestore.js');
const { claimJobCreation, claimPublish, releasePublishClaim, JobNotFoundError } = await import(
  '../../src/services/idempotency.js'
);
const { JOB_STATUS } = await import('../../src/models/jobsRepo.js');

describe('idempotency: claimJobCreation', () => {
  it('creates a new job on first use of a key', async () => {
    const result = await claimJobCreation({
      shopDomain: 'shop-a.myshopify.com',
      idempotencyKey: 'key-1',
      jobId: 'job-1',
      jobData: { productId: 'p1', contentType: 'scene', templateId: 't1' },
    });
    expect(result).toEqual({ created: true, jobId: 'job-1' });

    const jobDoc = await firestore.collection('jobs').doc('job-1').get();
    expect(jobDoc.exists).toBe(true);
    expect(jobDoc.data().status).toBe(JOB_STATUS.PENDING);
  });

  it('returns the existing jobId on a retried key instead of creating a duplicate', async () => {
    await claimJobCreation({
      shopDomain: 'shop-b.myshopify.com',
      idempotencyKey: 'key-2',
      jobId: 'job-2',
      jobData: { productId: 'p2', contentType: 'scene', templateId: 't1' },
    });

    const retry = await claimJobCreation({
      shopDomain: 'shop-b.myshopify.com',
      idempotencyKey: 'key-2',
      // Even if the caller generates a different jobId on retry, the original wins.
      jobId: 'job-2-different-attempt',
      jobData: { productId: 'p2', contentType: 'scene', templateId: 't1' },
    });

    expect(retry).toEqual({ created: false, jobId: 'job-2' });
    const impostor = await firestore.collection('jobs').doc('job-2-different-attempt').get();
    expect(impostor.exists).toBe(false);
  });

  it('scopes idempotency keys per shop — same key, different shop, is a distinct claim', async () => {
    await claimJobCreation({
      shopDomain: 'shop-c1.myshopify.com',
      idempotencyKey: 'shared-key',
      jobId: 'job-c1',
      jobData: {},
    });
    const other = await claimJobCreation({
      shopDomain: 'shop-c2.myshopify.com',
      idempotencyKey: 'shared-key',
      jobId: 'job-c2',
      jobData: {},
    });
    expect(other).toEqual({ created: true, jobId: 'job-c2' });
  });
});

describe('idempotency: claimPublish', () => {
  beforeEach(async () => {
    await firestore.collection('jobs').doc('publish-job').set({
      status: JOB_STATUS.SUCCEEDED,
      publishedAt: null,
      variations: [{ url: 'https://example.com/1.png', approved: true, publishedToShopify: false }],
    });
  });

  it('claims publish on first call', async () => {
    const result = await claimPublish('publish-job');
    expect(result.alreadyPublished).toBe(false);

    const doc = await firestore.collection('jobs').doc('publish-job').get();
    expect(doc.data().publishedAt).toBeTruthy();
  });

  it('reports already-published on a second call without re-publishing', async () => {
    await claimPublish('publish-job');
    const second = await claimPublish('publish-job');
    expect(second.alreadyPublished).toBe(true);
  });

  it('throws JobNotFoundError for a missing job', async () => {
    await expect(claimPublish('does-not-exist')).rejects.toBeInstanceOf(JobNotFoundError);
  });

  it('releasePublishClaim allows a subsequent retry after a failed publish call', async () => {
    await claimPublish('publish-job');
    await releasePublishClaim('publish-job');
    const retry = await claimPublish('publish-job');
    expect(retry.alreadyPublished).toBe(false);
  });
});
