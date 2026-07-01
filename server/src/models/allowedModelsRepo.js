import { createRepo } from '../lib/createRepo.js';

const repo = createRepo('allowed_models');

// Platform-admin-managed catalog of FAL models a merchant may pick directly when writing their
// own prompt instead of using a template (see routes/api/customGenerate.js). Deliberately a
// separate collection from `templates` — a template bundles a fixed prompt+model+cost together;
// an allowed model is just "this FAL model, at this cost, may be used with a merchant's own
// prompt" and carries no prompt of its own.
export const allowedModelsRepo = {
  collection: repo.collection,

  async getById(modelId) {
    return repo.getById(modelId);
  },

  async upsert(modelId, data) {
    await repo.collection().doc(modelId).set(data, { merge: true });
  },

  async findAll() {
    const snapshot = await repo.collection().get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async findActiveByCategory(category) {
    const snapshot = await repo.collection().where('category', '==', category).where('active', '==', true).get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  async delete(modelId) {
    await repo.collection().doc(modelId).delete();
  },
};
