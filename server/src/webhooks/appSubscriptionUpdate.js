import { shopsRepo } from '../models/shopsRepo.js';
import { logger } from '../lib/logger.js';
import { PACK_PLAN_NAMES } from '../services/billing.js';

const UNLIMITED_PLAN_NAME = 'unlimited';
const IMAGE_OPTIMIZER_ADDON_PLAN_NAME = 'image_optimizer_addon';

// Fired whenever a subscription's status changes on Shopify's side — e.g. the merchant cancels
// from the Shopify admin (not our UI), or a renewal payment fails and Shopify freezes it. This is
// the only path that notices a starter/growth/pro cancellation made outside our own Cancel button
// (routes/api/credits.js's POST /billing/cancel already downgrades the shop synchronously for
// that path) — without this, a shop that cancels via the Shopify admin would keep showing as
// subscribed until it happened to hit the throttled recheck in GET /api/credits.
export async function handleAppSubscriptionUpdate(shopDomain, payload) {
  const subscription = payload?.app_subscription;
  if (!subscription) return;

  const isActive = subscription.status === 'ACTIVE';

  if (subscription.name === UNLIMITED_PLAN_NAME) {
    await shopsRepo.updatePlan(shopDomain, isActive ? 'unlimited' : 'free');
  } else if (subscription.name === IMAGE_OPTIMIZER_ADDON_PLAN_NAME) {
    await shopsRepo.updateImageOptimizerAddon(shopDomain, isActive);
  } else if (PACK_PLAN_NAMES.includes(subscription.name)) {
    if (isActive) {
      await shopsRepo.updatePackSubscription(shopDomain, { plan: subscription.name, subscriptionId: subscription.admin_graphql_api_id });
    } else {
      await shopsRepo.updatePlan(shopDomain, 'free');
      await shopsRepo.clearPackSubscription(shopDomain);
    }
  } else {
    return;
  }

  logger.info({ shopDomain, plan: subscription.name, status: subscription.status }, 'app_subscriptions/update processed');
}
