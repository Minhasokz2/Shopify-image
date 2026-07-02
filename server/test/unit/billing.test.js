import { describe, it, expect, vi, beforeEach } from 'vitest';

const billingCheck = vi.fn();
const billingRequest = vi.fn();
const billingCancel = vi.fn();
vi.mock('../../src/config/shopify.js', () => ({
  shopify: { api: { billing: { check: billingCheck, request: billingRequest, cancel: billingCancel } } },
}));

const addCredits = vi.fn();
vi.mock('../../src/services/creditLedger.js', () => ({ addCredits }));

const updatePackSubscription = vi.fn();
const clearPackSubscription = vi.fn();
const updatePlan = vi.fn();
const updateImageOptimizerAddon = vi.fn();
vi.mock('../../src/models/shopsRepo.js', () => ({
  shopsRepo: { updatePackSubscription, clearPackSubscription, updatePlan, updateImageOptimizerAddon },
}));

const { reconcileBillingState, cancelSubscription, createPackSubscription, CREDIT_PACKS } = await import(
  '../../src/services/billing.js'
);

const SESSION = { shop: 'shop.myshopify.com' };

beforeEach(() => {
  vi.clearAllMocks();
  addCredits.mockResolvedValue({ alreadyCredited: false });
});

describe('billing: createPackSubscription', () => {
  it('requests the named plan and returns the confirmation URL', async () => {
    billingRequest.mockResolvedValue({ confirmationUrl: 'https://admin.shopify.com/confirm' });
    const url = await createPackSubscription({ session: SESSION, packId: 'growth', returnUrl: 'https://x/confirm' });

    expect(url).toBe('https://admin.shopify.com/confirm');
    expect(billingRequest).toHaveBeenCalledWith(
      expect.objectContaining({ session: SESSION, plan: 'growth', returnUrl: 'https://x/confirm' }),
    );
  });
});

describe('billing: reconcileBillingState — recurring pack subscriptions', () => {
  it('credits a pack once per billing period, keyed on subscription id + currentPeriodEnd', async () => {
    billingCheck.mockResolvedValue({
      oneTimePurchases: [],
      appSubscriptions: [
        {
          id: 'gid://shopify/AppSubscription/1',
          name: 'pro',
          status: 'ACTIVE',
          currentPeriodEnd: '2026-08-01T00:00:00Z',
        },
      ],
    });

    const result = await reconcileBillingState({ session: SESSION, isTest: true });

    expect(addCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        shopDomain: SESSION.shop,
        creditsAdded: CREDIT_PACKS.pro.credits,
        amountUSD: CREDIT_PACKS.pro.amountUSD,
        type: 'pack_subscription',
        packId: 'pro',
        shopifyChargeId: 'gid://shopify/AppSubscription/1:2026-08-01T00:00:00Z',
      }),
    );
    expect(updatePackSubscription).toHaveBeenCalledWith(SESSION.shop, {
      plan: 'pro',
      subscriptionId: 'gid://shopify/AppSubscription/1',
    });
    expect(result.activePackPlan).toBe('pro');
    expect(result.creditedPacks).toEqual([
      { packId: 'pro', alreadyCredited: false, currentPeriodEnd: '2026-08-01T00:00:00Z' },
    ]);
  });

  it('ignores subscriptions that are not one of the known credit packs (e.g. unlimited/addon)', async () => {
    billingCheck.mockResolvedValue({
      oneTimePurchases: [],
      appSubscriptions: [
        { id: 'gid://shopify/AppSubscription/2', name: 'unlimited', status: 'ACTIVE', currentPeriodEnd: 'x' },
      ],
    });

    const result = await reconcileBillingState({ session: SESSION, isTest: true });

    expect(addCredits).not.toHaveBeenCalled();
    expect(updatePackSubscription).not.toHaveBeenCalled();
    expect(updatePlan).toHaveBeenCalledWith(SESSION.shop, 'unlimited');
    expect(result.activePackPlan).toBeNull();
  });

  it('ignores cancelled pack subscriptions', async () => {
    billingCheck.mockResolvedValue({
      oneTimePurchases: [],
      appSubscriptions: [
        { id: 'gid://shopify/AppSubscription/3', name: 'starter', status: 'CANCELLED', currentPeriodEnd: 'x' },
      ],
    });

    const result = await reconcileBillingState({ session: SESSION, isTest: true });

    expect(addCredits).not.toHaveBeenCalled();
    expect(result.activePackPlan).toBeNull();
  });

  it('still credits legacy one-time custom credit purchases alongside pack subscriptions', async () => {
    billingCheck.mockResolvedValue({
      oneTimePurchases: [{ id: 'gid://shopify/AppPurchaseOneTime/9', name: 'Custom credits (87)', status: 'ACTIVE' }],
      appSubscriptions: [],
    });

    await reconcileBillingState({ session: SESSION, isTest: true });

    expect(addCredits).toHaveBeenCalledWith(
      expect.objectContaining({ creditsAdded: 87, type: 'custom_credit_purchase', shopifyChargeId: 'gid://shopify/AppPurchaseOneTime/9' }),
    );
  });
});

describe('billing: cancelSubscription', () => {
  it('cancels a pack subscription and downgrades the shop to free', async () => {
    await cancelSubscription({ session: SESSION, subscriptionId: 'gid://shopify/AppSubscription/1', planName: 'pro' });

    expect(billingCancel).toHaveBeenCalledWith(
      expect.objectContaining({ session: SESSION, subscriptionId: 'gid://shopify/AppSubscription/1' }),
    );
    expect(updatePlan).toHaveBeenCalledWith(SESSION.shop, 'free');
    expect(clearPackSubscription).toHaveBeenCalledWith(SESSION.shop);
  });

  it('cancels the image optimizer add-on without touching the credits plan', async () => {
    await cancelSubscription({ session: SESSION, subscriptionId: 'gid://shopify/AppSubscription/2', planName: 'image_optimizer_addon' });

    expect(updateImageOptimizerAddon).toHaveBeenCalledWith(SESSION.shop, false);
    expect(updatePlan).not.toHaveBeenCalled();
    expect(clearPackSubscription).not.toHaveBeenCalled();
  });
});
