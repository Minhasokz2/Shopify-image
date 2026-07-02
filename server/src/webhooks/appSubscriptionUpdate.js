import { shopsRepo } from '../models/shopsRepo.js';
import { logger } from '../lib/logger.js';

const UNLIMITED_PLAN_NAME = 'unlimited';
const IMAGE_OPTIMIZER_ADDON_PLAN_NAME = 'image_optimizer_addon';

// Fired whenever a subscription's status changes on Shopify's side — e.g. the merchant cancels
// from the Shopify admin (not our UI), or a renewal payment fails and Shopify freezes it.
export async function handleAppSubscriptionUpdate(shopDomain, payload) {
  const subscription = payload?.app_subscription;
  if (!subscription) return;

  const isActive = subscription.status === 'ACTIVE';

  if (subscription.name === UNLIMITED_PLAN_NAME) {
    await shopsRepo.updatePlan(shopDomain, isActive ? 'unlimited' : 'free');
  } else if (subscription.name === IMAGE_OPTIMIZER_ADDON_PLAN_NAME) {
    await shopsRepo.updateImageOptimizerAddon(shopDomain, isActive);
  } else {
    return;
  }

  logger.info({ shopDomain, plan: subscription.name, status: subscription.status }, 'app_subscriptions/update processed');
}
