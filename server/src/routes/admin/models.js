import { Router } from 'express';
import { z } from 'zod';
import { allowedModelsRepo } from '../../models/allowedModelsRepo.js';
import { SCENE_MODEL_IDS } from '../../services/fal.js';

const router = Router();

// Scene-only for now (spec decision) — sourced directly from fal.js's SCENE_MODEL_IDS, the same
// list routes/admin/templates.js uses, so the allowed-models catalog and the template model
// picker can never drift apart again. Every one of these was verified live against fal.ai's real
// schema to have a genuine image-input parameter before being added — Imagen 4 was evaluated and
// rejected for having none (pure text-to-image), which is why it isn't in this list.
const KNOWN_SCENE_MODELS = SCENE_MODEL_IDS;

const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens only (e.g. "flux-kontext-max")');

const modelFields = {
  label: z.string().min(1).max(120),
  category: z.enum(['scene']),
  falModel: z.enum(KNOWN_SCENE_MODELS),
  creditCost: z.coerce.number().int().positive().max(1000),
  supportsMultiImage: z.coerce.boolean().default(false),
  active: z.coerce.boolean().default(true),
};

const createModelSchema = z.object({ id: idSchema, ...modelFields });
const updateModelSchema = z.object(modelFields);

// GET /admin/api/models — every allowed model, including inactive ones (the admin's own view).
router.get('/models', async (req, res) => {
  const models = await allowedModelsRepo.findAll();
  res.json({ models });
});

router.get('/models/:id', async (req, res) => {
  const model = await allowedModelsRepo.getById(req.params.id);
  if (!model) return res.status(404).json({ error: 'Model not found' });
  return res.json({ model });
});

// POST /admin/api/models — create. 409s if the id already exists.
router.post('/models', async (req, res) => {
  const { id, ...body } = createModelSchema.parse(req.body);

  const existing = await allowedModelsRepo.getById(id);
  if (existing) {
    return res.status(409).json({ error: `Model "${id}" already exists — use PUT to update it.` });
  }

  await allowedModelsRepo.upsert(id, body);
  const created = await allowedModelsRepo.getById(id);
  return res.status(201).json({ model: created });
});

// PUT /admin/api/models/:id
router.put('/models/:id', async (req, res) => {
  const body = updateModelSchema.parse(req.body);
  const existing = await allowedModelsRepo.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Model not found' });

  await allowedModelsRepo.upsert(req.params.id, body);
  const updated = await allowedModelsRepo.getById(req.params.id);
  return res.json({ model: updated });
});

// DELETE /admin/api/models/:id
router.delete('/models/:id', async (req, res) => {
  const existing = await allowedModelsRepo.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Model not found' });

  await allowedModelsRepo.delete(req.params.id);
  return res.status(204).send();
});

export default router;
