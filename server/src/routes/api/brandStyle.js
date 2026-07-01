import { Router } from 'express';
import { z } from 'zod';
import { shopsRepo } from '../../models/shopsRepo.js';
import { extractBrandStyle } from '../../services/anthropicCopy.js';

const router = Router();

const extractSchema = z.object({ productPageUrls: z.array(z.string().url()).min(3).max(5) });

// POST /api/brand-style/extract — runs Claude 4.5 Haiku extraction, stores the profile.
router.post('/brand-style/extract', async (req, res) => {
  const { productPageUrls } = extractSchema.parse(req.body);
  const profile = await extractBrandStyle(productPageUrls);
  const brandStyleProfile = { ...profile, extractedAt: new Date() };
  await shopsRepo.getRef(req.shopDomain).update({ brandStyleProfile });
  res.json({ brandStyleProfile });
});

// GET /api/brand-style — current profile for the shop, injected into every generation prompt.
router.get('/brand-style', async (req, res) => {
  const shop = await shopsRepo.getByDomain(req.shopDomain);
  res.json({ brandStyleProfile: shop?.brandStyleProfile ?? null });
});

export default router;
