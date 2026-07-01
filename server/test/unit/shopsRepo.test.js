import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/firestore.js', async () => {
  const { createFakeFirestore } = await import('../helpers/fakeFirestore.js');
  const fake = createFakeFirestore();
  return { firestore: fake.firestore, FieldValue: fake.FieldValue, Timestamp: {} };
});

const { shopsRepo, normalizeTrialEmail } = await import('../../src/models/shopsRepo.js');

describe('normalizeTrialEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeTrialEmail('  Merchant@Example.com  ')).toBe('merchant@example.com');
  });

  it('strips dots and +tags from a gmail.com local part', () => {
    expect(normalizeTrialEmail('john.doe+trial2@gmail.com')).toBe('johndoe@gmail.com');
  });

  it('treats googlemail.com as gmail.com', () => {
    expect(normalizeTrialEmail('a.b+x@googlemail.com')).toBe('ab@gmail.com');
  });

  it('does not strip dots for non-gmail domains', () => {
    expect(normalizeTrialEmail('first.last@example.com')).toBe('first.last@example.com');
  });
});

describe('shopsRepo.ensureShopExists: trial-abuse guard', () => {
  it('grants the free trial to a brand-new shop with no prior email claim', async () => {
    const shop = await shopsRepo.ensureShopExists('shop-a.myshopify.com', { shopEmail: 'owner@example.com' });
    expect(shop.isNew).toBe(true);
    expect(shop.trialCreditsGranted).toBe(true);
    expect(shop.creditBalance).toBe(10);
  });

  it('grants zero trial credits to a second shop reusing the same (normalized) email', async () => {
    await shopsRepo.ensureShopExists('shop-b1.myshopify.com', { shopEmail: 'farmer+first@gmail.com' });
    const second = await shopsRepo.ensureShopExists('shop-b2.myshopify.com', { shopEmail: 'farmer+second@gmail.com' });

    expect(second.isNew).toBe(true);
    expect(second.trialCreditsGranted).toBe(false);
    expect(second.creditBalance).toBe(0);
  });

  it('grants the trial normally when no email is available at all', async () => {
    const shop = await shopsRepo.ensureShopExists('shop-c.myshopify.com', {});
    expect(shop.trialCreditsGranted).toBe(true);
    expect(shop.creditBalance).toBe(10);
  });

  it('is idempotent — a second call for the same shop returns the existing doc unchanged', async () => {
    await shopsRepo.ensureShopExists('shop-d.myshopify.com', { shopEmail: 'once@example.com' });
    const again = await shopsRepo.ensureShopExists('shop-d.myshopify.com', { shopEmail: 'once@example.com' });

    expect(again.isNew).toBe(false);
    expect(again.creditBalance).toBe(10);
  });
});
