import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../src/lib/firestore.js', async () => {
  const { createFakeFirestore } = await import('../helpers/fakeFirestore.js');
  const fake = createFakeFirestore();
  return { firestore: fake.firestore, FieldValue: fake.FieldValue, Timestamp: {} };
});

// Every route under createApp() gets exercised, but admin routes don't need a Shopify session —
// this mock just keeps config/shopify.js's transitive import chain from touching real Firestore.
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
const validTemplate = {
  id: 'test-studio-scene',
  name: 'Test Studio Scene',
  category: 'scene',
  promptTemplate: 'A clean studio backdrop for testing.',
  preferredModel: 'flux-kontext-max',
  creditCost: 4,
};

describe('Admin template CRUD (/admin/api/templates)', () => {
  it('rejects every route without a valid admin key', async () => {
    const app = createApp();
    const withoutKey = await request(app).get('/admin/api/templates');
    const withWrongKey = await request(app).get('/admin/api/templates').set('x-admin-key', 'nope');

    expect(withoutKey.status).toBe(401);
    expect(withWrongKey.status).toBe(401);
  });

  it('creates a template, then rejects a duplicate id with 409', async () => {
    const app = createApp();

    const created = await request(app).post('/admin/api/templates').set(ADMIN_HEADER).send(validTemplate);
    expect(created.status).toBe(201);
    expect(created.body.template).toMatchObject({ id: 'test-studio-scene', creditCost: 4 });

    const duplicate = await request(app).post('/admin/api/templates').set(ADMIN_HEADER).send(validTemplate);
    expect(duplicate.status).toBe(409);
  });

  it('400s on an invalid payload (bad id format, wrong model for category)', async () => {
    const app = createApp();

    const badId = await request(app)
      .post('/admin/api/templates')
      .set(ADMIN_HEADER)
      .send({ ...validTemplate, id: 'Not A Valid Slug!' });
    expect(badId.status).toBe(400);

    const wrongModel = await request(app)
      .post('/admin/api/templates')
      .set(ADMIN_HEADER)
      .send({ ...validTemplate, id: 'another-template', preferredModel: 'gpt-image-2' });
    expect(wrongModel.status).toBe(400);
  });

  it('lists templates, including one just created', async () => {
    const app = createApp();
    await request(app).post('/admin/api/templates').set(ADMIN_HEADER).send({ ...validTemplate, id: 'list-me' });

    const listed = await request(app).get('/admin/api/templates').set(ADMIN_HEADER);
    expect(listed.status).toBe(200);
    expect(listed.body.templates.some((t) => t.id === 'list-me')).toBe(true);
  });

  it('updates an existing template — e.g. reassigning its prompt and cost', async () => {
    const app = createApp();
    await request(app).post('/admin/api/templates').set(ADMIN_HEADER).send({ ...validTemplate, id: 'update-me' });

    const updated = await request(app)
      .put('/admin/api/templates/update-me')
      .set(ADMIN_HEADER)
      .send({ ...validTemplate, promptTemplate: 'A brand new prompt.', creditCost: 7 });

    expect(updated.status).toBe(200);
    expect(updated.body.template.promptTemplate).toBe('A brand new prompt.');
    expect(updated.body.template.creditCost).toBe(7);
  });

  it('404s updating or deleting a template that does not exist', async () => {
    const app = createApp();

    const updateMissing = await request(app)
      .put('/admin/api/templates/does-not-exist')
      .set(ADMIN_HEADER)
      .send(validTemplate);
    expect(updateMissing.status).toBe(404);

    const deleteMissing = await request(app).delete('/admin/api/templates/does-not-exist').set(ADMIN_HEADER);
    expect(deleteMissing.status).toBe(404);
  });

  it('deletes a template, after which it is gone', async () => {
    const app = createApp();
    await request(app).post('/admin/api/templates').set(ADMIN_HEADER).send({ ...validTemplate, id: 'delete-me' });

    const deleted = await request(app).delete('/admin/api/templates/delete-me').set(ADMIN_HEADER);
    expect(deleted.status).toBe(204);

    const fetched = await request(app).get('/admin/api/templates/delete-me').set(ADMIN_HEADER);
    expect(fetched.status).toBe(404);
  });
});
