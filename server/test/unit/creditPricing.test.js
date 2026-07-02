import { describe, it, expect, vi, beforeEach } from 'vitest';

const findAll = vi.fn();
vi.mock('../../src/models/allowedModelsRepo.js', () => ({ allowedModelsRepo: { findAll } }));

const {
  getMaxRealCostPerCredit,
  getMinSafePricePerCredit,
  estimateCustomCredits,
  InvalidCustomAmountError,
  MIN_CUSTOM_PURCHASE_USD,
  MAX_CUSTOM_PURCHASE_USD,
} = await import('../../src/services/creditPricing.js');

beforeEach(() => {
  vi.clearAllMocks();
});

// Real per-image costs are hardcoded in modelCosts.js (mirroring ModelForm.jsx) — these tests use
// real catalog ids so they exercise the actual cost table, not a fake one.
describe('getMaxRealCostPerCredit', () => {
  it('finds the worst-case real-cost-per-credit ratio among active models only', async () => {
    findAll.mockResolvedValue([
      { falModel: 'flux-kontext-max', creditCost: 2, active: true }, // 0.08/2 = 0.04
      { falModel: 'gpt-image-2-banner', creditCost: 9, active: true }, // 1.00/9 = 0.1111 (worst)
      { falModel: 'nano-banana-pro', creditCost: 3, active: false }, // inactive — ignored even though it'd otherwise count
    ]);

    const max = await getMaxRealCostPerCredit();
    expect(max).toBeCloseTo(1.0 / 9, 5);
  });

  it('ignores models missing from the real-cost table or with no creditCost', async () => {
    findAll.mockResolvedValue([
      { falModel: 'totally-unknown-model', creditCost: 1, active: true },
      { falModel: 'flux-kontext-pro', creditCost: 0, active: true }, // falsy creditCost — would divide weirdly
    ]);

    const max = await getMaxRealCostPerCredit();
    // Nothing usable in the catalog — falls back to the historical $0.115 reference rate.
    expect(max).toBe(0.115);
  });
});

describe('getMinSafePricePerCredit', () => {
  it('prices at exactly 2x the worst-case real cost per credit, guaranteeing >= 50% margin', async () => {
    findAll.mockResolvedValue([{ falModel: 'gpt-image-2-banner', creditCost: 9, active: true }]);

    const price = await getMinSafePricePerCredit();
    const maxRealCostPerCredit = 1.0 / 9;
    // margin = (price - cost) / price >= 0.5  <=>  price >= 2 * cost
    expect(price).toBeGreaterThanOrEqual(2 * maxRealCostPerCredit);
    const margin = (price - maxRealCostPerCredit) / price;
    expect(margin).toBeGreaterThanOrEqual(0.5);
  });
});

describe('estimateCustomCredits', () => {
  it('rejects an amount below the minimum', async () => {
    findAll.mockResolvedValue([{ falModel: 'flux-kontext-max', creditCost: 2, active: true }]);
    await expect(estimateCustomCredits(MIN_CUSTOM_PURCHASE_USD - 1)).rejects.toThrow(InvalidCustomAmountError);
  });

  it('rejects an amount above the maximum', async () => {
    findAll.mockResolvedValue([{ falModel: 'flux-kontext-max', creditCost: 2, active: true }]);
    await expect(estimateCustomCredits(MAX_CUSTOM_PURCHASE_USD + 1)).rejects.toThrow(InvalidCustomAmountError);
  });

  it('rejects non-finite amounts', async () => {
    findAll.mockResolvedValue([{ falModel: 'flux-kontext-max', creditCost: 2, active: true }]);
    await expect(estimateCustomCredits(NaN)).rejects.toThrow(InvalidCustomAmountError);
  });

  it('floors the credit count (never rounds up) so realized margin never dips below the guarantee', async () => {
    findAll.mockResolvedValue([{ falModel: 'gpt-image-2-banner', creditCost: 9, active: true }]);

    const { credits, pricePerCredit, marginPct } = await estimateCustomCredits(20);

    expect(credits).toBe(Math.floor(20 / pricePerCredit));
    expect(marginPct).toBe(50);

    // The actual worst-case redemption of every credit still leaves >= 50% margin.
    const maxRealCostPerCredit = 1.0 / 9;
    const totalRevenue = credits * pricePerCredit;
    const totalWorstCaseCost = credits * maxRealCostPerCredit;
    const realizedMargin = (totalRevenue - totalWorstCaseCost) / totalRevenue;
    expect(realizedMargin).toBeGreaterThanOrEqual(0.5);
  });

  it('rejects an amount too small to buy even 1 credit at the guaranteed-margin rate', async () => {
    // A deliberately extreme cost/creditCost ratio (real cost $1.00, priced as a tenth of a
    // credit) to force the safe price-per-credit ($20/credit) above the minimum purchase amount,
    // so even $MIN_CUSTOM_PURCHASE_USD buys 0 whole credits.
    findAll.mockResolvedValue([{ falModel: 'gpt-image-2-banner', creditCost: 0.1, active: true }]);
    await expect(estimateCustomCredits(MIN_CUSTOM_PURCHASE_USD)).rejects.toThrow(InvalidCustomAmountError);
  });
});
