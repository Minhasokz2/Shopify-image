import { Router } from 'express';
import { rawBodyParser, verifyWebhookHmac } from '../middleware/verifyWebhookHmac.js';
import { handleAppUninstalled } from '../webhooks/appUninstalled.js';
import { handleShopRedact } from '../webhooks/shopRedact.js';
import { handleCustomersRedact } from '../webhooks/customersRedact.js';
import { handleCustomersDataRequest } from '../webhooks/customersDataRequest.js';
import { handleAppSubscriptionUpdate } from '../webhooks/appSubscriptionUpdate.js';

const router = Router();

// Paths here must match the `uri` values declared under [[webhooks.subscriptions]] in
// shopify.app.toml exactly — these are app-specific subscriptions, not shop-specific ones
// registered through @shopify/shopify-app-express.
router.use(rawBodyParser, verifyWebhookHmac);

router.post('/app/uninstalled', async (req, res) => {
  await handleAppUninstalled(req.webhook.domain);
  res.status(200).send();
});

router.post('/shop/redact', async (req, res) => {
  await handleShopRedact(req.webhook.domain);
  res.status(200).send();
});

router.post('/customers/redact', async (req, res) => {
  await handleCustomersRedact(req.webhook.domain, req.body);
  res.status(200).send();
});

router.post('/customers/data_request', async (req, res) => {
  await handleCustomersDataRequest(req.webhook.domain, req.body);
  res.status(200).send();
});

router.post('/app_subscriptions/update', async (req, res) => {
  await handleAppSubscriptionUpdate(req.webhook.domain, req.body);
  res.status(200).send();
});

export default router;
