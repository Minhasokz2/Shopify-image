import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/firestore.js', async () => {
  const { createFakeFirestore } = await import('../helpers/fakeFirestore.js');
  const fake = createFakeFirestore();
  return { firestore: fake.firestore, FieldValue: fake.FieldValue, Timestamp: {} };
});

const { jobsRepo, JOB_STATUS } = await import('../../src/models/jobsRepo.js');

const STALE_CLAIM = new Date(Date.now() - 11 * 60 * 1000); // past the 10-minute lease timeout
const FRESH_CLAIM = new Date(Date.now() - 30 * 1000);

describe('jobsRepo.claimForProcessing', () => {
  it('claims a pending job (the normal fast path, right after job creation)', async () => {
    await jobsRepo.create('job-pending', { status: JOB_STATUS.PENDING, shopDomain: 'shop.myshopify.com' });

    const result = await jobsRepo.claimForProcessing('job-pending');

    expect(result.claimed).toBe(true);
    const stored = await jobsRepo.getById('job-pending');
    expect(stored.status).toBe(JOB_STATUS.PROCESSING);
    expect(stored.claimedAt).toBeTruthy();
  });

  it('refuses to claim a processing job whose lease is still fresh — another worker is presumed alive', async () => {
    await jobsRepo.create('job-live-lease', {
      status: JOB_STATUS.PROCESSING,
      shopDomain: 'shop.myshopify.com',
      claimedAt: FRESH_CLAIM,
    });

    const result = await jobsRepo.claimForProcessing('job-live-lease');

    expect(result.claimed).toBe(false);
  });

  it('allows reclaiming a processing job whose lease has gone stale — its original worker is presumed dead', async () => {
    await jobsRepo.create('job-stale-lease', {
      status: JOB_STATUS.PROCESSING,
      shopDomain: 'shop.myshopify.com',
      claimedAt: STALE_CLAIM,
    });

    const result = await jobsRepo.claimForProcessing('job-stale-lease');

    expect(result.claimed).toBe(true);
    const stored = await jobsRepo.getById('job-stale-lease');
    expect(stored.claimedAt).not.toEqual(STALE_CLAIM);
  });

  it('never reclaims an already-succeeded job, even with a long-stale claimedAt', async () => {
    await jobsRepo.create('job-done', {
      status: JOB_STATUS.SUCCEEDED,
      shopDomain: 'shop.myshopify.com',
      claimedAt: STALE_CLAIM,
    });

    const result = await jobsRepo.claimForProcessing('job-done');

    expect(result.claimed).toBe(false);
  });

  it('returns claimed: false for a job that does not exist', async () => {
    const result = await jobsRepo.claimForProcessing('no-such-job');
    expect(result.claimed).toBe(false);
  });
});

describe('jobsRepo.updateProgressStage', () => {
  it('refreshes claimedAt as a heartbeat so a genuinely-running job never goes stale', async () => {
    await jobsRepo.create('job-heartbeat', {
      status: JOB_STATUS.PROCESSING,
      shopDomain: 'shop.myshopify.com',
      claimedAt: STALE_CLAIM,
    });

    await jobsRepo.updateProgressStage('job-heartbeat', 'generating');

    const stored = await jobsRepo.getById('job-heartbeat');
    expect(stored.progressStage).toBe('generating');
    expect(stored.claimedAt).not.toEqual(STALE_CLAIM);

    // The freshly-heartbeated lease should now be live, not reclaimable.
    const result = await jobsRepo.claimForProcessing('job-heartbeat');
    expect(result.claimed).toBe(false);
  });
});

describe('jobsRepo.findByShop', () => {
  const SHOP = 'find-by-shop-test.myshopify.com';

  it('filters by status and content type together without needing a 4th composite index', async () => {
    await jobsRepo.create('job-a', { shopDomain: SHOP, status: JOB_STATUS.SUCCEEDED, contentType: 'scene' });
    await jobsRepo.create('job-b', { shopDomain: SHOP, status: JOB_STATUS.SUCCEEDED, contentType: 'video' });
    await jobsRepo.create('job-c', { shopDomain: SHOP, status: JOB_STATUS.FAILED, contentType: 'scene' });

    const jobs = await jobsRepo.findByShop(SHOP, { status: JOB_STATUS.SUCCEEDED, contentType: 'scene' });

    expect(jobs.map((j) => j.id)).toEqual(['job-a']);
  });

  it('still respects a plain single-filter query (the common case)', async () => {
    await jobsRepo.create('job-d', { shopDomain: SHOP, status: JOB_STATUS.SUCCEEDED, contentType: 'scene' });
    await jobsRepo.create('job-e', { shopDomain: SHOP, status: JOB_STATUS.FAILED, contentType: 'scene' });

    const jobs = await jobsRepo.findByShop(SHOP, { status: JOB_STATUS.SUCCEEDED });

    expect(jobs.every((j) => j.status === JOB_STATUS.SUCCEEDED)).toBe(true);
  });

  it('respects the requested limit even when a second filter is applied in memory', async () => {
    for (let i = 0; i < 5; i += 1) {
      await jobsRepo.create(`job-limit-${i}`, { shopDomain: SHOP, status: JOB_STATUS.SUCCEEDED, contentType: 'scene' });
    }

    const jobs = await jobsRepo.findByShop(SHOP, { status: JOB_STATUS.SUCCEEDED, contentType: 'scene', limit: 2 });

    expect(jobs).toHaveLength(2);
  });
});
