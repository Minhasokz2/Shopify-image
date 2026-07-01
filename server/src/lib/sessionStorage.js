import { Session } from '@shopify/shopify-api';
import { firestore } from './firestore.js';

const COLLECTION = 'shopify_sessions';

// No official Firestore adapter exists for @shopify/shopify-app-session-storage (verified
// against the npm registry at plan time) — this implements the abstract SessionStorage
// interface directly against Firestore, following the same shape as the official
// in-memory/SQL adapters (see @shopify/shopify-app-session-storage-memory for reference).
export class FirestoreSessionStorage {
  async storeSession(session) {
    const data = session.toObject();
    await firestore.collection(COLLECTION).doc(session.id).set(serialize(data));
    return true;
  }

  async loadSession(id) {
    const doc = await firestore.collection(COLLECTION).doc(id).get();
    if (!doc.exists) return undefined;
    return new Session(deserialize(doc.data()));
  }

  async deleteSession(id) {
    await firestore.collection(COLLECTION).doc(id).delete();
    return true;
  }

  async deleteSessions(ids) {
    if (ids.length === 0) return true;
    const batch = firestore.batch();
    ids.forEach((id) => batch.delete(firestore.collection(COLLECTION).doc(id)));
    await batch.commit();
    return true;
  }

  async findSessionsByShop(shop) {
    const snapshot = await firestore.collection(COLLECTION).where('shop', '==', shop).get();
    return snapshot.docs.map((doc) => new Session(deserialize(doc.data())));
  }
}

// Firestore rejects `undefined` field values — strip them rather than writing them.
function serialize(data) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

// Firestore round-trips JS Dates as Timestamp instances; the Session class expects real Dates.
function deserialize(data) {
  const result = { ...data };
  for (const key of ['expires', 'refreshTokenExpires']) {
    if (result[key] && typeof result[key].toDate === 'function') {
      result[key] = result[key].toDate();
    }
  }
  return result;
}
