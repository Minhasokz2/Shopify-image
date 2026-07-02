import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/firestore.js', async () => {
  const { createFakeFirestore } = await import('../helpers/fakeFirestore.js');
  const fake = createFakeFirestore();
  return { firestore: fake.firestore, FieldValue: fake.FieldValue, Timestamp: {} };
});

const { firestore } = await import('../../src/lib/firestore.js');
const {
  assertSufficientCredits,
  settleJobSuccess,
  settleJobFailure,
  addCredits,
  InsufficientCreditsError,
  UnknownTemplateError,
  UnknownModelError,
} = await import('../../src/services/creditLedger.js');
const { JOB_STATUS } = await import('../../src/models/jobsRepo.js');

async function seedShop(id, data) {
  await firestore.collection('shops').doc(id).set({ creditBalance: 50, plan: 'free', ...data });
}

async function seedTemplate(id, data) {
  await firestore.collection('templates').doc(id).set({ creditCost: 4, ...data });
}

async function seedJob(id, data) {
  await firestore.collection('jobs').doc(id).set({ status: JOB_STATUS.PROCESSING, creditsCharged: 0, ...data });
}

describe('creditLedger: assertSufficientCredits (pre-flight only, never deducts)', () => {
  it('passes when balance covers the template cost', async () => {
    await seedShop('shop1.myshopify.com', { creditBalance: 10 });
    await seedTemplate('studio-white', { creditCost: 4 });
    await expect(assertSufficientCredits('shop1.myshopify.com', { templateId: 'studio-white' })).resolves.toMatchObject({
      creditCost: 4,
    });

    const shop = await firestore.collection('shops').doc('shop1.myshopify.com').get();
    expect(shop.data().creditBalance).toBe(10); // untouched — pre-flight never deducts
  });

  it('throws InsufficientCreditsError when balance is too low', async () => {
    await seedShop('shop2.myshopify.com', { creditBalance: 2 });
    await seedTemplate('ugc-home-casual', { creditCost: 5 });
    await expect(
      assertSufficientCredits('shop2.myshopify.com', { templateId: 'ugc-home-casual' }),
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
  });

  it('skips the balance check entirely for unlimited-plan shops', async () => {
    await seedShop('shop3.myshopify.com', { creditBalance: 0, plan: 'unlimited' });
    await seedTemplate('video-cinematic-pan', { creditCost: 15 });
    await expect(
      assertSufficientCredits('shop3.myshopify.com', { templateId: 'video-cinematic-pan' }),
    ).resolves.toBeTruthy();
  });

  it('throws UnknownTemplateError for a templateId the client made up', async () => {
    await seedShop('shop4.myshopify.com', {});
    await expect(
      assertSufficientCredits('shop4.myshopify.com', { templateId: 'not-a-real-template' }),
    ).rejects.toBeInstanceOf(UnknownTemplateError);
  });

  it('passes when balance covers an allowed model cost (custom-prompt path)', async () => {
    await seedShop('shop-custom1.myshopify.com', { creditBalance: 10 });
    await firestore.collection('allowed_models').doc('flux-kontext-max').set({ creditCost: 4, active: true });
    await expect(
      assertSufficientCredits('shop-custom1.myshopify.com', { modelId: 'flux-kontext-max' }),
    ).resolves.toMatchObject({ creditCost: 4 });
  });

  it('throws UnknownModelError for a disabled model', async () => {
    await seedShop('shop-custom2.myshopify.com', { creditBalance: 10 });
    await firestore.collection('allowed_models').doc('imagen-4').set({ creditCost: 3, active: false });
    await expect(
      assertSufficientCredits('shop-custom2.myshopify.com', { modelId: 'imagen-4' }),
    ).rejects.toBeInstanceOf(UnknownModelError);
  });

  it('scales the allowed-model cost by numImages — per-image pricing, not per-job', async () => {
    await seedShop('shop-custom4.myshopify.com', { creditBalance: 20 });
    await firestore.collection('allowed_models').doc('flux-kontext-max').set({ creditCost: 4, active: true });

    await expect(
      assertSufficientCredits('shop-custom4.myshopify.com', { modelId: 'flux-kontext-max', numImages: 3 }),
    ).resolves.toMatchObject({ creditCost: 4 }); // the raw per-image rate on the record itself

    // 4 credits/image * 3 images = 12 required — a shop with only 10 can't afford it, even
    // though it could afford a single image at 4.
    await seedShop('shop-custom5.myshopify.com', { creditBalance: 10 });
    await expect(
      assertSufficientCredits('shop-custom5.myshopify.com', { modelId: 'flux-kontext-max', numImages: 3 }),
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
  });
});

describe('creditLedger: settleJobSuccess (deduct only on success, server-recomputed cost)', () => {
  it('deducts the template cost and marks the job succeeded', async () => {
    await seedShop('shop5.myshopify.com', { creditBalance: 20 });
    await seedTemplate('marble-surface', { creditCost: 4 });
    await seedJob('job5', { shopDomain: 'shop5.myshopify.com' });

    const result = await settleJobSuccess({
      jobId: 'job5',
      shopDomain: 'shop5.myshopify.com',
      templateId: 'marble-surface',
      variations: [{ url: 'https://x/1.png', approved: false, publishedToShopify: false }],
      modelUsed: 'flux-kontext-max',
    });

    expect(result).toEqual({ alreadyCharged: false, creditsCharged: 4 });
    const shop = await firestore.collection('shops').doc('shop5.myshopify.com').get();
    expect(shop.data().creditBalance).toBe(16);
    const job = await firestore.collection('jobs').doc('job5').get();
    expect(job.data().status).toBe(JOB_STATUS.SUCCEEDED);
    const ledger = await firestore.collection('transactions').doc('job_job5').get();
    expect(ledger.data().creditsAdded).toBe(-4);
  });

  it('uses the CURRENT template cost, not any cost cached on the job, ignoring client-supplied values', async () => {
    await seedShop('shop6.myshopify.com', { creditBalance: 20 });
    await seedTemplate('flatlay-topdown', { creditCost: 4 });
    // Simulate a job doc that somehow carries a stale/tampered cost — must be ignored.
    await seedJob('job6', { shopDomain: 'shop6.myshopify.com', creditsCharged: 999 });

    await settleJobSuccess({
      jobId: 'job6',
      shopDomain: 'shop6.myshopify.com',
      templateId: 'flatlay-topdown',
      variations: [],
      modelUsed: 'flux-kontext-max',
    });

    const shop = await firestore.collection('shops').doc('shop6.myshopify.com').get();
    expect(shop.data().creditBalance).toBe(16); // -4, not -999
  });

  it('does not deduct credits for unlimited-plan shops', async () => {
    await seedShop('shop7.myshopify.com', { creditBalance: 0, plan: 'unlimited' });
    await seedTemplate('video-slow-rotate', { creditCost: 8 });
    await seedJob('job7', { shopDomain: 'shop7.myshopify.com' });

    await settleJobSuccess({
      jobId: 'job7',
      shopDomain: 'shop7.myshopify.com',
      templateId: 'video-slow-rotate',
      variations: [],
      modelUsed: 'seedance-fast',
    });

    const shop = await firestore.collection('shops').doc('shop7.myshopify.com').get();
    expect(shop.data().creditBalance).toBe(0);
  });

  it('is idempotent — settling an already-succeeded job twice never double-charges', async () => {
    await seedShop('shop8.myshopify.com', { creditBalance: 20 });
    await seedTemplate('wood-surface', { creditCost: 4 });
    await seedJob('job8', { shopDomain: 'shop8.myshopify.com' });

    await settleJobSuccess({
      jobId: 'job8',
      shopDomain: 'shop8.myshopify.com',
      templateId: 'wood-surface',
      variations: [],
      modelUsed: 'flux-kontext-max',
    });
    const secondAttempt = await settleJobSuccess({
      jobId: 'job8',
      shopDomain: 'shop8.myshopify.com',
      templateId: 'wood-surface',
      variations: [],
      modelUsed: 'flux-kontext-max',
    });

    expect(secondAttempt).toEqual({ alreadyCharged: true, creditsCharged: 4 });
    const shop = await firestore.collection('shops').doc('shop8.myshopify.com').get();
    expect(shop.data().creditBalance).toBe(16); // deducted exactly once
  });

  it('deducts the allowed-model cost for a custom-prompt job (no templateId)', async () => {
    await seedShop('shop-custom3.myshopify.com', { creditBalance: 20 });
    await firestore.collection('allowed_models').doc('flux-kontext-max').set({ creditCost: 4, active: true });
    await seedJob('job-custom3', { shopDomain: 'shop-custom3.myshopify.com' });

    const result = await settleJobSuccess({
      jobId: 'job-custom3',
      shopDomain: 'shop-custom3.myshopify.com',
      modelId: 'flux-kontext-max',
      variations: [],
      modelUsed: 'flux-kontext-max',
    });

    expect(result).toEqual({ alreadyCharged: false, creditsCharged: 4 });
    const shop = await firestore.collection('shops').doc('shop-custom3.myshopify.com').get();
    expect(shop.data().creditBalance).toBe(16);
  });

  it('charges numImages * per-image cost for a custom-prompt job, read from the job doc itself', async () => {
    await seedShop('shop-custom6.myshopify.com', { creditBalance: 20 });
    await firestore.collection('allowed_models').doc('flux-kontext-max').set({ creditCost: 4, active: true });
    await seedJob('job-custom6', { shopDomain: 'shop-custom6.myshopify.com', numImages: 3 });

    const result = await settleJobSuccess({
      jobId: 'job-custom6',
      shopDomain: 'shop-custom6.myshopify.com',
      modelId: 'flux-kontext-max',
      variations: [],
      modelUsed: 'flux-kontext-max',
    });

    expect(result).toEqual({ alreadyCharged: false, creditsCharged: 12 });
    const shop = await firestore.collection('shops').doc('shop-custom6.myshopify.com').get();
    expect(shop.data().creditBalance).toBe(8);
  });
});

describe('creditLedger: settleJobFailure (never charges)', () => {
  it('marks the job failed without touching the shop balance', async () => {
    await seedShop('shop9.myshopify.com', { creditBalance: 20 });
    await seedJob('job9', { shopDomain: 'shop9.myshopify.com' });

    await settleJobFailure({ jobId: 'job9', errorMessage: 'model API timed out' });

    const job = await firestore.collection('jobs').doc('job9').get();
    expect(job.data().status).toBe(JOB_STATUS.FAILED);
    const shop = await firestore.collection('shops').doc('shop9.myshopify.com').get();
    expect(shop.data().creditBalance).toBe(20);
  });

  it('refuses to downgrade an already-succeeded job to failed', async () => {
    await seedJob('job10', { status: JOB_STATUS.SUCCEEDED, creditsCharged: 4 });
    await settleJobFailure({ jobId: 'job10', errorMessage: 'late duplicate failure signal' });
    const job = await firestore.collection('jobs').doc('job10').get();
    expect(job.data().status).toBe(JOB_STATUS.SUCCEEDED);
  });
});

describe('creditLedger: addCredits (idempotent on shopifyChargeId)', () => {
  it('credits the shop balance for a one-time pack purchase', async () => {
    await seedShop('shop11.myshopify.com', { creditBalance: 5 });
    await addCredits({
      shopDomain: 'shop11.myshopify.com',
      creditsAdded: 200,
      amountUSD: 29,
      type: 'one_time_pack',
      packId: 'growth',
      shopifyChargeId: 'charge-abc',
    });
    const shop = await firestore.collection('shops').doc('shop11.myshopify.com').get();
    expect(shop.data().creditBalance).toBe(205);
  });

  it('does not double-credit the same shopifyChargeId on a retried webhook', async () => {
    await seedShop('shop12.myshopify.com', { creditBalance: 5 });
    const args = {
      shopDomain: 'shop12.myshopify.com',
      creditsAdded: 200,
      amountUSD: 29,
      type: 'one_time_pack',
      packId: 'growth',
      shopifyChargeId: 'charge-xyz',
    };
    const first = await addCredits(args);
    const second = await addCredits(args);

    expect(first.alreadyCredited).toBe(false);
    expect(second.alreadyCredited).toBe(true);
    const shop = await firestore.collection('shops').doc('shop12.myshopify.com').get();
    expect(shop.data().creditBalance).toBe(205);
  });
});
