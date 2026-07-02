import { Router } from 'express';
import { z } from 'zod';
import { templatesRepo } from '../../models/templatesRepo.js';

const router = Router();

// 'imagen-4' removed after live verification showed it has zero image-input parameters (pure
// text-to-image) — it was silently discarding the actual product photo for every template
// assigned to it. Keep in sync with SCENE_ENDPOINTS in services/fal.js.
const MODELS_BY_CATEGORY = {
  scene: ['flux-kontext-max', 'flux-kontext-pro'],
  ugc: ['gpt-image-2'],
  video: ['seedance-fast', 'kling-3', 'wan-2.7'],
};

// Slug-like id used directly as the Firestore doc id and threaded verbatim into job records —
// keep it URL-safe and stable, unlike `name` which is just display text.
const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens only (e.g. "studio-white")');

const templateFields = {
  name: z.string().min(1).max(120),
  category: z.enum(['scene', 'ugc', 'video']),
  promptTemplate: z.string().min(1).max(2000),
  preferredModel: z.string().min(1),
  creditCost: z.coerce.number().int().positive().max(1000),
  thumbnailUrl: z.string().url().nullable().optional(),
  setting: z.string().max(200).optional(),
};

function checkPreferredModel(body, ctx) {
  if (!MODELS_BY_CATEGORY[body.category].includes(body.preferredModel)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['preferredModel'],
      message: `preferredModel must be one of: ${MODELS_BY_CATEGORY[body.category].join(', ')} for category "${body.category}"`,
    });
  }
}

const createTemplateSchema = z.object({ id: idSchema, ...templateFields }).superRefine(checkPreferredModel);
const updateTemplateSchema = z.object(templateFields).superRefine(checkPreferredModel);

// GET /admin/api/templates — full catalog, including fields the merchant-facing endpoint doesn't
// need to expose differently (there's currently no difference, but this is the admin's own view).
router.get('/templates', async (req, res) => {
  const templates = await templatesRepo.findAll();
  res.json({ templates });
});

router.get('/templates/:id', async (req, res) => {
  const template = await templatesRepo.getById(req.params.id);
  if (!template) return res.status(404).json({ error: 'Template not found' });
  return res.json({ template });
});

// POST /admin/api/templates — create. 409s if the id already exists, so this never silently
// overwrites a template PUT was meant to update.
router.post('/templates', async (req, res) => {
  const { id, ...body } = createTemplateSchema.parse(req.body);

  const existing = await templatesRepo.getById(id);
  if (existing) {
    return res.status(409).json({ error: `Template "${id}" already exists — use PUT to update it.` });
  }

  await templatesRepo.upsert(id, { ...body, thumbnailUrl: body.thumbnailUrl ?? null });
  const created = await templatesRepo.getById(id);
  return res.status(201).json({ template: created });
});

// PUT /admin/api/templates/:id — full update (assigning a new prompt, cost, model, etc).
router.put('/templates/:id', async (req, res) => {
  const body = updateTemplateSchema.parse(req.body);
  const existing = await templatesRepo.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Template not found' });

  await templatesRepo.upsert(req.params.id, { ...body, thumbnailUrl: body.thumbnailUrl ?? null });
  const updated = await templatesRepo.getById(req.params.id);
  return res.json({ template: updated });
});

// DELETE /admin/api/templates/:id
router.delete('/templates/:id', async (req, res) => {
  const existing = await templatesRepo.getById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Template not found' });

  await templatesRepo.delete(req.params.id);
  return res.status(204).send();
});

export default router;
