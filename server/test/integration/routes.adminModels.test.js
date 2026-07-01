import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/lib/firestore.js', async () => {
  const { createFakeFirestore } = await import('../helpers/fakeFirestore.js');
  const fake = createFakeFirestore();
  return { firestore: fake.firestore, FieldValue: fake.FieldValue, Timestamp: {} };
});

vi.mock('../../src/lib/sessionStorage.js', () => ({
  FirestoreSessionStorage: class {
    async storeSession() {
      return true;
    }
    async loadSession() {
      return undefined;
    }
    async deleteSession() {
      return true;
    }
    async deleteSessions() {
      return true;
    }
    async findSessionsByShop() {
      return [];
    }
  },
}));

const { env } = await import('../../src/config/env.js');
const { createApp } = await import('../../src/app.js');

const ADMIN_HEADER = { 'x-admin-key': env.ADMIN_API_KEY };
const validModel = {
  id: 'test-flux-kontext-max',
  label: 'FLUX Kontext Max',
  category: 'scene',
  falModel: 'flux-kontext-max',
  creditCost: 4,
  supportsMultiImage: true,
  active: true,
};

describe('Admin model CRUD (/admin/api/models)', () => {
  it('rejects every route without a valid admin key', async () => {
    const app = createApp();
    const withoutKey = await request(app).get('/admin/api/models');
    expect(withoutKey.status).toBe(401);
  });

  it('creates a model, then rejects a duplicate id with 409', async () => {
    const app = createApp();

    const created = await request(app).post('/admin/api/models').set(ADMIN_HEADER).send(validModel);
    expect(created.status).toBe(201);
    expect(created.body.model).toMatchObject({ id: 'test-flux-kontext-max', creditCost: 4, supportsMultiImage: true });

    const duplicate = await request(app).post('/admin/api/models').set(ADMIN_HEADER).send(validModel);
    expect(duplicate.status).toBe(409);
  });

  it('400s on an invalid payload (unknown falModel, bad id format)', async () => {
    const app = createApp();

    const badFalModel = await request(app)
      .post('/admin/api/models')
      .set(ADMIN_HEADER)
      .send({ ...validModel, id: 'bad-model', falModel: 'not-a-real-model' });
    expect(badFalModel.status).toBe(400);

    const badId = await request(app)
      .post('/admin/api/models')
      .set(ADMIN_HEADER)
      .send({ ...validModel, id: 'Not A Valid Slug!' });
    expect(badId.status).toBe(400);
  });

  it('lists models, including one just created', async () => {
    const app = createApp();
    await request(app).post('/admin/api/models').set(ADMIN_HEADER).send({ ...validModel, id: 'list-me' });

    const listed = await request(app).get('/admin/api/models').set(ADMIN_HEADER);
    expect(listed.status).toBe(200);
    expect(listed.body.models.some((m) => m.id === 'list-me')).toBe(true);
  });

  it('updates an existing model — e.g. disabling it or changing cost', async () => {
    const app = createApp();
    await request(app).post('/admin/api/models').set(ADMIN_HEADER).send({ ...validModel, id: 'update-me' });

    const updated = await request(app)
      .put('/admin/api/models/update-me')
      .set(ADMIN_HEADER)
      .send({ ...validModel, creditCost: 6, active: false });

    expect(updated.status).toBe(200);
    expect(updated.body.model.creditCost).toBe(6);
    expect(updated.body.model.active).toBe(false);
  });

  it('404s updating or deleting a model that does not exist', async () => {
    const app = createApp();

    const updateMissing = await request(app).put('/admin/api/models/does-not-exist').set(ADMIN_HEADER).send(validModel);
    expect(updateMissing.status).toBe(404);

    const deleteMissing = await request(app).delete('/admin/api/models/does-not-exist').set(ADMIN_HEADER);
    expect(deleteMissing.status).toBe(404);
  });

  it('deletes a model, after which it is gone', async () => {
    const app = createApp();
    await request(app).post('/admin/api/models').set(ADMIN_HEADER).send({ ...validModel, id: 'delete-me' });

    const deleted = await request(app).delete('/admin/api/models/delete-me').set(ADMIN_HEADER);
    expect(deleted.status).toBe(204);

    const fetched = await request(app).get('/admin/api/models/delete-me').set(ADMIN_HEADER);
    expect(fetched.status).toBe(404);
  });
});
