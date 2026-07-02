import { Router } from 'express';
import { z } from 'zod';
import { jobsRepo } from '../../models/jobsRepo.js';
import { publishJobToShopify } from '../../services/publish.js';
import { createGenerationJob } from '../../services/jobCreation.js';
import { requireJobCapacity } from '../../middleware/rateLimiter.js';

const router = Router();

const generateRequestSchema = z.object({ idempotencyKey: z.string().min(1) }).passthrough();

// POST /api/generate — spec Section 9. Single source of truth for creating any content-type job.
router.post('/generate', requireJobCapacity, async (req, res) => {
  const { idempotencyKey, ...input } = generateRequestSchema.parse(req.body);
  const { created, jobId } = await createGenerationJob({ shopDomain: req.shopDomain, input, idempotencyKey });
  res.status(created ? 201 : 200).json({ jobId });
});

// GET /api/jobs — job history for the shop, with re-download/re-publish data (spec Section 3/11).
router.get('/jobs', async (req, res) => {
  const { status, contentType, batchId, limit } = req.query;
  const jobs = await jobsRepo.findByShop(req.shopDomain, {
    status: typeof status === 'string' ? status : undefined,
    contentType: typeof contentType === 'string' ? contentType : undefined,
    batchId: typeof batchId === 'string' ? batchId : undefined,
    limit: limit ? Number(limit) : undefined,
  });
  res.json({ jobs });
});

// GET /api/jobs/:jobId — poll single job status.
router.get('/jobs/:jobId', async (req, res) => {
  const job = await jobsRepo.getById(req.params.jobId);
  if (!job || job.shopDomain !== req.shopDomain) {
    return res.status(404).json({ error: 'Job not found' });
  }
  return res.json({ job });
});

// POST /api/jobs/:jobId/publish — publish the merchant's selected variations to Shopify product
// media. `approvedIndices` is authoritative here — it's the only place the review screen's
// approve checkboxes are ever persisted (see claimPublish in services/idempotency.js).
const publishRequestSchema = z.object({
  productId: z.string().min(1),
  approvedIndices: z.array(z.number().int().min(0)).default([]),
});

router.post('/jobs/:jobId/publish', async (req, res) => {
  const { productId, approvedIndices } = publishRequestSchema.parse(req.body);
  const job = await jobsRepo.getById(req.params.jobId);
  if (!job || job.shopDomain !== req.shopDomain) {
    return res.status(404).json({ error: 'Job not found' });
  }

  const result = await publishJobToShopify({
    session: req.shopSession,
    jobId: req.params.jobId,
    productId,
    approvedIndices,
  });
  return res.json(result);
});

export default router;
