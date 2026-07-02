import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/lib/firestore.js', async () => {
  const { createFakeFirestore } = await import('../helpers/fakeFirestore.js');
  const fake = createFakeFirestore();
  return { firestore: fake.firestore, FieldValue: fake.FieldValue, Timestamp: {} };
});

const { firestore } = await import('../../src/lib/firestore.js');
const {
  assertQuotaAvailable,
  getUsageSummary,
  recordConversionOutcome,
  DailyLimitReachedError,
  FREE_DAILY_LIMIT,
} = await import('../../src/services/imageOptimizerQuota.js');

const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

async function seedShop(id, data = {}) {
  await firestore.collection('shops').doc(id).set({ imageOptimizerAddon: false, ...data });
}

async function seedUsage(shopId, data) {
  await firestore.collection('image_optimizer_usage').doc(shopId).set(data);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('assertQuotaAvailable: pre-flight only, never mutates', () => {
  it('passes and does not create a usage doc for a shop with no prior usage', async () => {
    await seedShop('shop-a.myshopify.com');
    await expect(assertQuotaAvailable('shop-a.myshopify.com', 3)).resolves.toEqual({
      unlimited: false,
      remaining: FREE_DAILY_LIMIT,
    });

    const doc = await firestore.collection('image_optimizer_usage').doc('shop-a.myshopify.com').get();
    expect(doc.exists).toBe(false);
  });

  it('throws DailyLimitReachedError with the correct remaining count when the request would exceed the limit', async () => {
    await seedShop('shop-b.myshopify.com');
    await seedUsage('shop-b.myshopify.com', { dailyCount: 8, lastResetDate: TODAY, totalConverted: 8, totalSavedBytes: 0 });

    await expect(assertQuotaAvailable('shop-b.myshopify.com', 3)).rejects.toThrow(DailyLimitReachedError);
    await expect(assertQuotaAvailable('shop-b.myshopify.com', 3)).rejects.toMatchObject({ statusCode: 402, remaining: 2 });
  });

  it('allows a request that exactly fills the remaining allowance', async () => {
    await seedShop('shop-c.myshopify.com');
    await seedUsage('shop-c.myshopify.com', { dailyCount: 7, lastResetDate: TODAY, totalConverted: 7, totalSavedBytes: 0 });

    await expect(assertQuotaAvailable('shop-c.myshopify.com', 3)).resolves.toEqual({ unlimited: false, remaining: 3 });
  });

  it('treats a stale (yesterday) dailyCount as reset back to 0', async () => {
    await seedShop('shop-d.myshopify.com');
    await seedUsage('shop-d.myshopify.com', {
      dailyCount: FREE_DAILY_LIMIT,
      lastResetDate: YESTERDAY,
      totalConverted: 40,
      totalSavedBytes: 12345,
    });

    await expect(assertQuotaAvailable('shop-d.myshopify.com', FREE_DAILY_LIMIT)).resolves.toEqual({
      unlimited: false,
      remaining: FREE_DAILY_LIMIT,
    });
  });

  it('bypasses the check entirely for a shop with the Image Optimizer add-on active', async () => {
    await seedShop('shop-e.myshopify.com', { imageOptimizerAddon: true });
    await seedUsage('shop-e.myshopify.com', { dailyCount: FREE_DAILY_LIMIT, lastResetDate: TODAY, totalConverted: 999, totalSavedBytes: 0 });

    await expect(assertQuotaAvailable('shop-e.myshopify.com', 50)).resolves.toEqual({ unlimited: true });
  });

  it('does not double-deduct on a retried request — checking twice in a row does not consume quota', async () => {
    await seedShop('shop-f.myshopify.com');
    await seedUsage('shop-f.myshopify.com', { dailyCount: 5, lastResetDate: TODAY, totalConverted: 5, totalSavedBytes: 0 });

    await assertQuotaAvailable('shop-f.myshopify.com', 5);
    await assertQuotaAvailable('shop-f.myshopify.com', 5); // same "batch" checked again, e.g. a retried HTTP request

    const doc = await firestore.collection('image_optimizer_usage').doc('shop-f.myshopify.com').get();
    expect(doc.data().dailyCount).toBe(5); // unchanged — assertQuotaAvailable never writes
  });
});

describe('recordConversionOutcome: the only place quota/totals are actually incremented', () => {
  it('creates the usage doc on the very first recorded conversion', async () => {
    await recordConversionOutcome('shop-g.myshopify.com', { savedBytes: 1000 });

    const doc = await firestore.collection('image_optimizer_usage').doc('shop-g.myshopify.com').get();
    expect(doc.data()).toMatchObject({ dailyCount: 1, totalConverted: 1, totalSavedBytes: 1000 });
  });

  it('increments dailyCount and lifetime totals on each subsequent call', async () => {
    await seedUsage('shop-h.myshopify.com', { dailyCount: 2, lastResetDate: TODAY, totalConverted: 2, totalSavedBytes: 500 });
    await recordConversionOutcome('shop-h.myshopify.com', { savedBytes: 200 });

    const doc = await firestore.collection('image_optimizer_usage').doc('shop-h.myshopify.com').get();
    expect(doc.data()).toMatchObject({ dailyCount: 3, totalConverted: 3, totalSavedBytes: 700 });
  });

  it('resets dailyCount for a new day but keeps lifetime totals accumulating', async () => {
    await seedUsage('shop-i.myshopify.com', { dailyCount: FREE_DAILY_LIMIT, lastResetDate: YESTERDAY, totalConverted: 40, totalSavedBytes: 9000 });
    await recordConversionOutcome('shop-i.myshopify.com', { savedBytes: 100 });

    const doc = await firestore.collection('image_optimizer_usage').doc('shop-i.myshopify.com').get();
    expect(doc.data()).toMatchObject({ dailyCount: 1, lastResetDate: TODAY, totalConverted: 41, totalSavedBytes: 9100 });
  });

  it('never records a negative saved-bytes value even if the converted asset came back larger', async () => {
    await recordConversionOutcome('shop-j.myshopify.com', { savedBytes: -500 });

    const doc = await firestore.collection('image_optimizer_usage').doc('shop-j.myshopify.com').get();
    expect(doc.data().totalSavedBytes).toBe(0);
  });
});

describe('getUsageSummary', () => {
  it('reports unlimited for an addon shop regardless of usage history', async () => {
    await seedShop('shop-k.myshopify.com', { imageOptimizerAddon: true });
    await seedUsage('shop-k.myshopify.com', { dailyCount: 999, lastResetDate: TODAY, totalConverted: 999, totalSavedBytes: 50000 });

    await expect(getUsageSummary('shop-k.myshopify.com')).resolves.toMatchObject({
      unlimited: true,
      dailyUsed: 0,
      remaining: null,
      totalConverted: 999,
      totalSavedBytes: 50000,
    });
  });

  it('reports free-tier usage and remaining allowance for a shop without the add-on', async () => {
    await seedShop('shop-l.myshopify.com');
    await seedUsage('shop-l.myshopify.com', { dailyCount: 4, lastResetDate: TODAY, totalConverted: 20, totalSavedBytes: 4000 });

    await expect(getUsageSummary('shop-l.myshopify.com')).resolves.toEqual({
      unlimited: false,
      dailyLimit: FREE_DAILY_LIMIT,
      dailyUsed: 4,
      remaining: FREE_DAILY_LIMIT - 4,
      totalConverted: 20,
      totalSavedBytes: 4000,
    });
  });

  it('returns zeroed defaults for a shop that has never converted anything', async () => {
    await seedShop('shop-m.myshopify.com');
    await expect(getUsageSummary('shop-m.myshopify.com')).resolves.toEqual({
      unlimited: false,
      dailyLimit: FREE_DAILY_LIMIT,
      dailyUsed: 0,
      remaining: FREE_DAILY_LIMIT,
      totalConverted: 0,
      totalSavedBytes: 0,
    });
  });
});
