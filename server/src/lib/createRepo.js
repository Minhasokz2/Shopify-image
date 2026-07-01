import { firestore, FieldValue } from './firestore.js';

// Shared CRUD primitives for the 6 near-identical Firestore collections in models/*Repo.js.
// Domain-specific queries/transitions live in each repo file, not here.
export function createRepo(collectionName) {
  const collection = () => firestore.collection(collectionName);

  return {
    collection,

    async getById(id) {
      const doc = await collection().doc(id).get();
      return doc.exists ? { id: doc.id, ...doc.data() } : null;
    },

    async create(id, data) {
      const ref = id ? collection().doc(id) : collection().doc();
      await ref.set({
        ...data,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return ref.id;
    },

    async update(id, data) {
      await collection()
        .doc(id)
        .update({ ...data, updatedAt: FieldValue.serverTimestamp() });
    },

    async delete(id) {
      await collection().doc(id).delete();
    },
  };
}
