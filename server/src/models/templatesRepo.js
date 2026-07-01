import { createRepo } from '../lib/createRepo.js';

const repo = createRepo('templates');

export const templatesRepo = {
  collection: repo.collection,

  async getById(templateId) {
    return repo.getById(templateId);
  },

  async upsert(templateId, data) {
    await repo.collection().doc(templateId).set(data, { merge: true });
  },

  async findAll() {
    const snapshot = await repo.collection().get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async findByCategory(category) {
    const snapshot = await repo.collection().where('category', '==', category).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async delete(templateId) {
    await repo.collection().doc(templateId).delete();
  },
};
