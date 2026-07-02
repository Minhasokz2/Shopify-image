import { Router } from 'express';
import { templatesRepo } from '../../models/templatesRepo.js';

const router = Router();

// GET /api/templates — full template library (scene + ugc + video).
router.get('/templates', async (req, res) => {
  const templates = await templatesRepo.findAll();
  // Admin-managed and can change at any moment from a separate app — never let a browser/proxy
  // cache serve a stale catalog to the merchant.
  res.set('Cache-Control', 'no-store');
  res.json({ templates });
});

export default router;
