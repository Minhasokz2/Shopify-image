import { allowedModelsRepo } from '../models/allowedModelsRepo.js';
import { REAL_COST_PER_IMAGE_USD } from './modelCosts.js';

// Non-negotiable floor: a custom credit purchase must never be priced low enough that a merchant
// could spend every credit on the single most expensive-per-credit active model and leave less
// than this margin on the table.
const MIN_MARGIN = 0.5;

// Historical reference rate (see seedAllowedModels.js/ModelForm.jsx: creditCost is computed as
// ceil(realCostUSD / $0.115), the fixed packs' bulk rate) — used only as a fallback if the
// Allowed Models catalog is ever empty, which should never happen in practice.
const FALLBACK_MAX_REAL_COST_PER_CREDIT = 0.115;

export class InvalidCustomAmountError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidCustomAmountError';
    this.statusCode = 400;
  }
}

export const MIN_CUSTOM_PURCHASE_USD = 5;
export const MAX_CUSTOM_PURCHASE_USD = 2000;

// The real-world cost a single credit could represent, worst case, right now — computed live
// from whichever Allowed Models are currently active, not a hardcoded snapshot. If the platform
// admin adds a pricier model tomorrow, the very next quote reflects it automatically. Scoped to
// the Allowed Models (custom-prompt) catalog: that's the fully open "spend your credits on
// whatever's active" surface. Templates carry their own admin-reviewed flat creditCost per
// template and aren't part of this calculation.
export async function getMaxRealCostPerCredit() {
  const models = await allowedModelsRepo.findAll();
  let max = 0;
  for (const model of models) {
    if (!model.active) continue;
    const realCost = REAL_COST_PER_IMAGE_USD[model.falModel];
    if (!realCost || !model.creditCost) continue;
    max = Math.max(max, realCost / model.creditCost);
  }
  return max > 0 ? max : FALLBACK_MAX_REAL_COST_PER_CREDIT;
}

// margin = (price - cost) / price >= MIN_MARGIN  <=>  price >= cost / (1 - MIN_MARGIN). Rounded
// up to the nearest tenth of a cent so floating-point rounding can never shave the realized
// margin under the floor.
export async function getMinSafePricePerCredit() {
  const maxRealCostPerCredit = await getMaxRealCostPerCredit();
  const rawPrice = maxRealCostPerCredit / (1 - MIN_MARGIN);
  return Math.ceil(rawPrice * 1000) / 1000;
}

// The live quote shown to the merchant as they type an amount, and the exact same math used at
// actual purchase time (billing.js) — what's previewed is what they get. Credits are floored
// (never rounded), so any fractional-cent remainder stays with the platform, not the merchant —
// the realized margin is always >= MIN_MARGIN, never dips under it due to rounding.
export async function estimateCustomCredits(amountUSD) {
  if (!Number.isFinite(amountUSD) || amountUSD < MIN_CUSTOM_PURCHASE_USD || amountUSD > MAX_CUSTOM_PURCHASE_USD) {
    throw new InvalidCustomAmountError(
      `Enter an amount between $${MIN_CUSTOM_PURCHASE_USD} and $${MAX_CUSTOM_PURCHASE_USD}.`,
    );
  }

  const pricePerCredit = await getMinSafePricePerCredit();
  const credits = Math.floor(amountUSD / pricePerCredit);

  if (credits < 1) {
    throw new InvalidCustomAmountError('This amount is too small to buy at least 1 credit at the current guaranteed-margin rate.');
  }

  return { credits, pricePerCredit, marginPct: Math.round(MIN_MARGIN * 100) };
}
