import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/firestore.js', async () => {
  const { createFakeFirestore } = await import('../helpers/fakeFirestore.js');
  const fake = createFakeFirestore();
  return { firestore: fake.firestore, FieldValue: fake.FieldValue, Timestamp: {} };
});

const { productsRepo, docId } = await import('../../src/models/productsRepo.js');

describe('productsRepo.docId', () => {
  it('sanitizes a Shopify GID so the result contains no path-separator characters', () => {
    const id = docId('shop.myshopify.com', 'gid://shopify/Product/123456789');
    expect(id).not.toContain('/');
    expect(id).not.toContain(':');
    expect(id).toBe('shop.myshopify.com__gid___shopify_Product_123456789');
  });
});

describe('productsRepo.upsertMany', () => {
  it('caches products keyed by raw Shopify GIDs without throwing an invalid-path error', async () => {
    await productsRepo.upsertMany('shop.myshopify.com', [
      { id: 'gid://shopify/Product/1', title: 'Widget' },
      { id: 'gid://shopify/Product/2', title: 'Gadget' },
    ]);

    const cached = await productsRepo.findByShop('shop.myshopify.com');
    expect(cached).toHaveLength(2);
    expect(cached.map((p) => p.title).sort()).toEqual(['Gadget', 'Widget']);
  });
});
