import { firestore, FieldValue } from '../lib/firestore.js';

const COLLECTION = 'products';

// Cache key is shopDomain+productId composite so the same collection safely holds every shop's
// catalog (spec Section 3: "cached in Firestore, incremental refresh"). productId is a Shopify
// GID (e.g. "gid://shopify/Product/123") — Firestore document IDs can't contain "/", so the GID
// is sanitized before being embedded rather than used raw.
export function docId(shopDomain, productId) {
  return `${shopDomain}__${productId.replace(/[/:]/g, '_')}`;
}

export const productsRepo = {
  async upsertMany(shopDomain, products) {
    if (products.length === 0) return;
    const batch = firestore.batch();
    for (const product of products) {
      const ref = firestore.collection(COLLECTION).doc(docId(shopDomain, product.id));
      batch.set(ref, { ...product, shopDomain, syncedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    await batch.commit();
  },

  async findByShop(shopDomain) {
    const snapshot = await firestore.collection(COLLECTION).where('shopDomain', '==', shopDomain).get();
    return snapshot.docs.map((doc) => doc.data());
  },
};
