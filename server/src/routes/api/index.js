import { Router } from 'express';
import { verifySessionToken } from '../../middleware/verifySessionToken.js';
import { requireShopContext } from '../../middleware/requireShopContext.js';
import { httpBurstLimiter } from '../../middleware/rateLimiter.js';

import templatesRouter from './templates.js';
import modelsRouter from './models.js';
import productsRouter from './products.js';
import jobsRouter from './jobs.js';
import batchesRouter from './batches.js';
import creditsRouter from './credits.js';
import brandStyleRouter from './brandStyle.js';
import referralsRouter from './referrals.js';
import googleAuthRouter from './googleAuth.js';
import imageOptimizerRouter from './imageOptimizer.js';
import uploadsRouter from './uploads.js';

const router = Router();

// Every /api/* route requires a valid App Bridge session token and an established shop context —
// including the Google-auth status/init endpoints below: the *result* of Google Sign-In gates the
// rest of the app, but checking/starting that flow itself still requires the caller to already be
// a legitimate, session-token-authenticated request from this specific shop's embedded app.
router.use(verifySessionToken, requireShopContext, httpBurstLimiter);

router.use(templatesRouter);
router.use(modelsRouter);
router.use(productsRouter);
router.use(jobsRouter);
router.use(batchesRouter);
router.use(creditsRouter);
router.use(brandStyleRouter);
router.use(referralsRouter);
router.use(googleAuthRouter);
router.use(imageOptimizerRouter);
router.use(uploadsRouter);

export default router;
