import { Router } from 'express';
import { verifySessionToken } from '../../middleware/verifySessionToken.js';
import { requireShopContext } from '../../middleware/requireShopContext.js';
import { httpBurstLimiter } from '../../middleware/rateLimiter.js';

import templatesRouter from './templates.js';
import productsRouter from './products.js';
import jobsRouter from './jobs.js';
import batchesRouter from './batches.js';
import creditsRouter from './credits.js';
import subscriptionRouter from './subscription.js';
import brandStyleRouter from './brandStyle.js';
import referralsRouter from './referrals.js';

const router = Router();

// Every /api/* route requires a valid App Bridge session token and an established shop context.
router.use(verifySessionToken, requireShopContext, httpBurstLimiter);

router.use(templatesRouter);
router.use(productsRouter);
router.use(jobsRouter);
router.use(batchesRouter);
router.use(creditsRouter);
router.use(subscriptionRouter);
router.use(brandStyleRouter);
router.use(referralsRouter);

export default router;
