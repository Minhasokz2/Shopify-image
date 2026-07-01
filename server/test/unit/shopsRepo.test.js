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

describe('shopsRepo.ensureShopExists', () => {
  it('creates a brand-new shop with 0 credits and no Google verification yet', async () => {
    const shop = await shopsRepo.ensureShopExists('shop-a.myshopify.com', {});
    expect(shop.isNew).toBe(true);
    expect(shop.creditBalance).toBe(0);
    expect(shop.googleVerifiedAt).toBeNull();
    expect(shop.trialCreditsGranted).toBe(false);
  });

  it('is idempotent — a second call for the same shop returns the existing doc unchanged', async () => {
    await shopsRepo.ensureShopExists('shop-b.myshopify.com', {});
    const again = await shopsRepo.ensureShopExists('shop-b.myshopify.com', {});
    expect(again.isNew).toBe(false);
  });
});

describe('shopsRepo.markGoogleVerified', () => {
  it('unlocks the shop and grants the free trial on first verification', async () => {
    await shopsRepo.ensureShopExists('shop-c.myshopify.com', {});
    const verified = await shopsRepo.markGoogleVerified('shop-c.myshopify.com', {
      googleEmail: 'owner@example.com',
      googleId: 'g-1',
    });

    expect(verified.trialCreditsGranted).toBe(true);
    expect(verified.creditBalance).toBe(10);

    const stored = await shopsRepo.getByDomain('shop-c.myshopify.com');
    expect(stored.googleVerifiedAt).toBeTruthy();
    expect(stored.googleEmail).toBe('owner@example.com');
  });

  it('unlocks a second shop reusing the same (normalized) Google email, but grants 0 credits', async () => {
    await shopsRepo.ensureShopExists('shop-d1.myshopify.com', {});
    await shopsRepo.markGoogleVerified('shop-d1.myshopify.com', { googleEmail: 'farmer+first@gmail.com', googleId: 'g-2' });

    await shopsRepo.ensureShopExists('shop-d2.myshopify.com', {});
    const second = await shopsRepo.markGoogleVerified('shop-d2.myshopify.com', {
      googleEmail: 'farmer+second@gmail.com',
      googleId: 'g-3',
    });

    expect(second.trialCreditsGranted).toBe(false);
    expect(second.creditBalance).toBe(0);
    // Still unlocked despite no trial credits — gating is on verification, not on the grant.
    expect(second.googleVerifiedAt).toBeTruthy();
  });

  it('is a no-op on re-verification — never re-grants the trial', async () => {
    await shopsRepo.ensureShopExists('shop-e.myshopify.com', {});
    await shopsRepo.markGoogleVerified('shop-e.myshopify.com', { googleEmail: 'staff1@example.com', googleId: 'g-4' });
    const reVerified = await shopsRepo.markGoogleVerified('shop-e.myshopify.com', {
      googleEmail: 'staff2@example.com',
      googleId: 'g-5',
    });

    // Original grant/email preserved — a second staff member signing in doesn't re-grant credits
    // or overwrite who originally verified the shop.
    const stored = await shopsRepo.getByDomain('shop-e.myshopify.com');
    expect(stored.creditBalance).toBe(10);
    expect(stored.googleEmail).toBe('staff1@example.com');
    expect(reVerified.googleEmail).toBe('staff1@example.com');
  });
});
