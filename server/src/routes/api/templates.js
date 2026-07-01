import { Router } from 'express';
import { templatesRepo } from '../../models/templatesRepo.js';

const router = Router();

// GET /api/templates — full template library (scene + ugc + video).
router.get('/templates', async (req, res) => {
  const templates = await templatesRepo.findAll();
  res.json({ templates });
});

export default router;
