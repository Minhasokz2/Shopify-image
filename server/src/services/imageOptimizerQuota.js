import { firestore, FieldValue } from '../lib/firestore.js';
import { shopsRepo } from '../models/shopsRepo.js';
import { imageOptimizerUsageRepo } from '../models/imageOptimizerUsageRepo.js';

// The feature's one core billing rule: 10 free conversions/day, unlimited via the $2.99/mo
// add-on. Deliberately the ONLY gate — format (WebP/AVIF) and single-vs-bulk don't change how
// many conversions something costs against the daily allowance, since "10 conversions/day" means
// exactly that, not "10 single WebP conversions/day".
export const FREE_DAILY_LIMIT = 10;

export class DailyLimitReachedError extends Error {
  constructor(remaining) {
    super(
      `Daily free conversion limit reached — ${remaining} conversion${remaining === 1 ? '' : 's'} left today. ` +
        'Upgrade to Image Optimizer unlimited ($2.99/mo) to remove the limit.',
    );
    this.name = 'DailyLimitReachedError';
    this.statusCode = 402;
    this.remaining = remaining;
  }
}

function todayDateKey() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD", UTC — simple and stable, no per-shop timezone tracking to maintain.
}

async function readTodayCount(shopDomain) {
  const doc = await imageOptimizerUsageRepo.getById(shopDomain);
  const today = todayDateKey();
  return doc && doc.lastResetDate === today ? doc.dailyCount : 0;
}

// Pre-flight ONLY — mirrors assertSufficientCredits's posture exactly: reads current usage and
// throws if the requested count wouldn't fit today's remaining allowance, but does not reserve or
// deduct anything itself. Actual consumption happens once per job, in recordConversionOutcome
// below, at the moment that specific job actually completes — not at request time. This avoids a
// double-deduction bug a request-time deduction would have: a retried "convert" request (same
// idempotency key) would otherwise burn quota twice even though claimConversionJobCreation
// correctly no-ops the duplicate job creation. The same TOCTOU race this accepts (two concurrent
// requests both passing the check before either's jobs land) is the same one assertSufficientCredits
// already accepts for credits — not a new risk introduced here.
export async function assertQuotaAvailable(shopDomain, count = 1) {
  const shop = await shopsRepo.getByDomain(shopDomain);
  if (shop?.imageOptimizerAddon) {
    return { unlimited: true };
  }

  const currentCount = await readTodayCount(shopDomain);
  if (currentCount + count > FREE_DAILY_LIMIT) {
    throw new DailyLimitReachedError(Math.max(0, FREE_DAILY_LIMIT - currentCount));
  }
  return { unlimited: false, remaining: FREE_DAILY_LIMIT - currentCount };
}

// Read-only — backs GET /api/image-optimizer/usage for the Convert Images page's quota banner and
// the Settings/Dashboard usage widgets.
export async function getUsageSummary(shopDomain) {
  const [shop, doc] = await Promise.all([shopsRepo.getByDomain(shopDomain), imageOptimizerUsageRepo.getById(shopDomain)]);
  const unlimited = Boolean(shop?.imageOptimizerAddon);
  const dailyCount = await readTodayCount(shopDomain);

  return {
    unlimited,
    dailyLimit: FREE_DAILY_LIMIT,
    dailyUsed: unlimited ? 0 : dailyCount,
    remaining: unlimited ? null : Math.max(0, FREE_DAILY_LIMIT - dailyCount),
    totalConverted: doc?.totalConverted ?? 0,
    totalSavedBytes: doc?.totalSavedBytes ?? 0,
  };
}

// Called by the worker exactly once per conversion job, at the moment it succeeds — guarded
// upstream by imageOptimizerWorker.js's own "already done, no-op" check, the same guarantee
// settleJobSuccess relies on for credits. Always increments dailyCount alongside the lifetime
// totals — harmless for addon shops since assertQuotaAvailable never reads dailyCount for them in
// the first place, and simpler than threading the shop's plan through the worker just to skip it.
export async function recordConversionOutcome(shopDomain, { savedBytes = 0 } = {}) {
  const ref = imageOptimizerUsageRepo.getRef(shopDomain);
  const today = todayDateKey();

  await firestore.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) {
      tx.set(ref, {
        dailyCount: 1,
        lastResetDate: today,
        totalConverted: 1,
        totalSavedBytes: Math.max(0, savedBytes),
        createdAt: FieldValue.serverTimestamp(),
      });
      return;
    }

    const data = doc.data();
    const isNewDay = data.lastResetDate !== today;
    const currentDailyCount = isNewDay ? 0 : data.dailyCount;

    tx.update(ref, {
      dailyCount: currentDailyCount + 1,
      lastResetDate: today,
      totalConverted: FieldValue.increment(1),
      totalSavedBytes: FieldValue.increment(Math.max(0, savedBytes)),
    });
  });
}
