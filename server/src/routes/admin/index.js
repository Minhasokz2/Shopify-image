import { Router } from 'express';
import { requireAdminKey } from '../../middleware/requireAdminKey.js';
import templatesRouter from './templates.js';
import modelsRouter from './models.js';

const router = Router();

// Every /admin/api/* route requires the shared admin key — not a Shopify session token, since
// this manages the template/model catalogs shared across every shop, not one shop's own data.
router.use(requireAdminKey);
router.use(templatesRouter);
router.use(modelsRouter);

export default router;
