import { deleteWhere, firestore } from '../lib/firestore.js';
import { logger } from '../lib/logger.js';

// GDPR mandatory webhook — fired ~48 hours after uninstall. Erase everything this app stored
// for the shop: jobs, batches, transactions, referrals, the session, and the shop doc itself.
export async function handleShopRedact(shopDomain) {
  const [jobsDeleted, batchesDeleted, transactionsDeleted, referralsAsReferrer, referralsAsReferred] =
    await Promise.all([
      deleteWhere('jobs', 'shopDomain', shopDomain),
      deleteWhere('batches', 'shopDomain', shopDomain),
      deleteWhere('transactions', 'shopDomain', shopDomain),
      deleteWhere('referrals', 'referrerShop', shopDomain),
      deleteWhere('referrals', 'referredShop', shopDomain),
    ]);

  await firestore.collection('shopify_sessions').doc(`offline_${shopDomain}`).delete();
  await firestore.collection('shops').doc(shopDomain).delete();

  logger.info(
    { shopDomain, jobsDeleted, batchesDeleted, transactionsDeleted, referralsAsReferrer, referralsAsReferred },
    'shop/redact: erased all stored data for shop',
  );
}
