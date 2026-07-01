import { shopsRepo } from '../models/shopsRepo.js';
import { logger } from '../lib/logger.js';

const UNLIMITED_PLAN_NAME = 'unlimited';

// Fired whenever a subscription's status changes on Shopify's side — e.g. the merchant cancels
// from the Shopify admin (not our UI), or a renewal payment fails and Shopify freezes it.
export async function handleAppSubscriptionUpdate(shopDomain, payload) {
  const subscription = payload?.app_subscription;
  if (!subscription || subscription.name !== UNLIMITED_PLAN_NAME) {
    return;
  }

  if (subscription.status === 'ACTIVE') {
    await shopsRepo.updatePlan(shopDomain, 'unlimited');
  } else {
    await shopsRepo.updatePlan(shopDomain, 'free');
  }

  logger.info({ shopDomain, status: subscription.status }, 'app_subscriptions/update processed');
}
