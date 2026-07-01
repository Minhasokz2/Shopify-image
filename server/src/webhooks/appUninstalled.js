import { shopify } from '../config/shopify.js';
import { shopsRepo } from '../models/shopsRepo.js';
import { logger } from '../lib/logger.js';

export async function handleAppUninstalled(shopDomain) {
  await shopsRepo.markUninstalled(shopDomain);
  await shopify.config.sessionStorage.deleteSession(`offline_${shopDomain}`);
  logger.info({ shopDomain }, 'App uninstalled — session revoked, shop marked uninstalled');
}
