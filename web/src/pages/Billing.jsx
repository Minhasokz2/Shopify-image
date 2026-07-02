import { useEffect, useState } from 'react';
import {
  BlockStack,
  Badge,
  Banner,
  Box,
  Button,
  Card,
  InlineStack,
  Layout,
  Page,
  Scrollable,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { CreditCardIcon, CashDollarIcon } from '@shopify/polaris-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useCreditBalance } from '../hooks/useCreditBalance.js';
import { SectionHeading } from '../components/SectionHeading.jsx';
import { apiClient } from '../api/client.js';

const PACKS = [
  {
    id: 'starter',
    name: 'Starter',
    priceLabel: '$9',
    credits: 50,
    benefits: ['50 fresh credits every month', 'Unused credits roll over — they never expire', 'Cancel anytime'],
  },
  {
    id: 'growth',
    name: 'Growth',
    priceLabel: '$29',
    credits: 200,
    benefits: ['200 fresh credits every month', '~19% cheaper per credit than Starter', 'Unused credits roll over — they never expire', 'Cancel anytime'],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceLabel: '$69',
    credits: 600,
    benefits: ['600 fresh credits every month', 'Our best per-credit rate — cheaper than buying custom credits', 'Unused credits roll over — they never expire', 'Cancel anytime'],
  },
];

// Shopify's billing confirmation page must break out of the embedded admin iframe, so this
// redirect targets window.top rather than navigating the SPA route or using window.location.
function redirectToConfirmation(confirmationUrl) {
  window.top.location.href = confirmationUrl;
}

// Debounced live quote for the custom-amount purchase below — recomputed server-side on every
// pause in typing using the exact same "guaranteed >= 50% margin, worst active model" math the
// actual purchase uses (server/src/services/creditPricing.js), so what's previewed here is
// always what gets charged, never a client-side guess that could drift from it.
function useCustomCreditEstimate(amountUSD) {
  const [estimate, setEstimate] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const amount = Number(amountUSD);
    if (!amountUSD || !Number.isFinite(amount) || amount <= 0) {
      setEstimate(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const result = await apiClient.get(`/api/billing/custom-purchase/estimate?amountUSD=${amount}`);
        setEstimate(result);
        setError(null);
      } catch (err) {
        setEstimate(null);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [amountUSD]);

  return { estimate, error, loading };
}

export default function Billing() {
  const queryClient = useQueryClient();
  const { data: credits, isLoading: creditsLoading } = useCreditBalance();
  const [pendingPackId, setPendingPackId] = useState(null);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const [customAmount, setCustomAmount] = useState('');
  const { estimate, error: estimateError, loading: estimateLoading } = useCustomCreditEstimate(customAmount);
  const [buyingCustom, setBuyingCustom] = useState(false);

  const handlePurchase = async (packId) => {
    setError(null);
    setPendingPackId(packId);
    try {
      const data = await apiClient.post('/api/billing/purchase', { packId });
      redirectToConfirmation(data.confirmationUrl);
    } catch (err) {
      setError(err.message);
      setPendingPackId(null);
    }
  };

  const handleCancel = async () => {
    setError(null);
    setCancelling(true);
    try {
      await apiClient.post('/api/billing/cancel', {});
      queryClient.invalidateQueries({ queryKey: ['credits'] });
    } catch (err) {
      setError(err.message);
    } finally {
      setCancelling(false);
    }
  };

  const handleBuyCustom = async () => {
    setError(null);
    setBuyingCustom(true);
    try {
      const data = await apiClient.post('/api/billing/custom-purchase', { amountUSD: Number(customAmount) });
      redirectToConfirmation(data.confirmationUrl);
    } catch (err) {
      setError(err.message);
      setBuyingCustom(false);
    }
  };

  // The balance shown elsewhere in the app is cached — refresh it once the merchant lands back
  // here after approving a charge, same as GenerationReview does after a job succeeds.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('confirmed') === 'true') {
      queryClient.invalidateQueries({ queryKey: ['credits'] });
    }
  }, [queryClient]);

  return (
    <Page title="Billing">
      <Layout>
        <Layout.Section>
          <Card>
            <InlineStack align="space-between" blockAlign="center" wrap>
              <SectionHeading icon={CreditCardIcon}>Current plan</SectionHeading>
              {creditsLoading ? (
                <Spinner size="small" accessibilityLabel="Loading current plan" />
              ) : (
                <InlineStack gap="300" blockAlign="center">
                  <Text as="span">
                    {credits?.plan ?? 'free'} plan · {credits?.creditBalance ?? 0} credits remaining
                  </Text>
                  {credits?.canCancelPlan ? (
                    <Button tone="critical" variant="tertiary" loading={cancelling} onClick={handleCancel}>
                      Cancel subscription
                    </Button>
                  ) : null}
                </InlineStack>
              )}
            </InlineStack>
          </Card>
        </Layout.Section>

        {error && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => setError(null)}>
              {error}
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <BlockStack gap="200">
            <Text as="p" tone="subdued">
              Monthly recurring plans — billed every 30 days, cancel anytime. Credits are topped up
              automatically on each renewal and never expire, so anything you don't use carries into
              next month.
            </Text>
            <InlineStack gap="400" wrap>
              {PACKS.map((pack) => {
                const isCurrentPlan = credits?.plan === pack.id;
                const planContent = (
                  <BlockStack gap="200">
                    <InlineStack align="space-between" blockAlign="center">
                      <Text as="h3" variant="headingSm">
                        {pack.name}
                      </Text>
                      {isCurrentPlan ? <Badge tone="success">Current plan</Badge> : null}
                    </InlineStack>
                    <InlineStack gap="100" blockAlign="baseline">
                      <Text as="p" variant="heading2xl">
                        {pack.priceLabel}
                      </Text>
                      <Text as="span" tone="subdued">
                        /month
                      </Text>
                    </InlineStack>
                    <Text as="p" tone="subdued">
                      {pack.credits} credits/month
                    </Text>
                    <BlockStack gap="100">
                      {pack.benefits.map((benefit) => (
                        <Text as="p" variant="bodySm" key={benefit}>
                          {`✓ ${benefit}`}
                        </Text>
                      ))}
                    </BlockStack>
                    <Button
                      variant="primary"
                      disabled={isCurrentPlan}
                      onClick={() => handlePurchase(pack.id)}
                      loading={pendingPackId === pack.id}
                    >
                      {isCurrentPlan ? 'Current plan' : 'Subscribe'}
                    </Button>
                  </BlockStack>
                );
                return (
                  <div key={pack.id} style={{ flex: '1 1 240px', minWidth: 240 }}>
                    <Card padding={isCurrentPlan ? '0' : undefined}>
                      {isCurrentPlan ? (
                        <Box background="bg-surface-secondary" padding="400" borderRadius="300">
                          {planContent}
                        </Box>
                      ) : (
                        planContent
                      )}
                    </Card>
                  </div>
                );
              })}
            </InlineStack>
          </BlockStack>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <SectionHeading icon={CashDollarIcon} variant="headingSm">
                Buy a custom amount
              </SectionHeading>
              <Text as="p" tone="subdued">
                Enter any amount between $5 and $2,000 to see how many credits — and how many
                images per model — that gets you.
              </Text>

              <TextField
                label="Amount (USD)"
                type="number"
                min={5}
                max={2000}
                prefix="$"
                value={customAmount}
                onChange={setCustomAmount}
                autoComplete="off"
              />

              {estimateLoading ? (
                <InlineStack gap="200" blockAlign="center">
                  <Spinner size="small" />
                  <Text as="span" tone="subdued">
                    Calculating…
                  </Text>
                </InlineStack>
              ) : estimateError ? (
                <Text as="span" tone="critical">
                  {estimateError}
                </Text>
              ) : estimate ? (
                <BlockStack gap="200">
                  <Text as="span" fontWeight="semibold">
                    {`${estimate.credits} credits`}
                  </Text>

                  {estimate.modelEstimates?.length > 0 ? (
                    <BlockStack gap="150">
                      <Text as="span" variant="bodySm" tone="subdued">
                        That's enough for:
                      </Text>
                      <Box borderWidth="025" borderColor="border" borderRadius="200">
                        <Scrollable shadow style={{ maxHeight: 240 }}>
                          <BlockStack gap="0">
                            {estimate.modelEstimates.map((model, i) => (
                              <Box
                                key={model.id}
                                padding="300"
                                borderBlockStartWidth={i === 0 ? '0' : '025'}
                                borderColor="border"
                              >
                                <InlineStack align="space-between" blockAlign="center">
                                  <Text as="span">{model.label}</Text>
                                  <Text as="span" fontWeight="semibold">
                                    {`${model.images} image${model.images === 1 ? '' : 's'}`}
                                  </Text>
                                </InlineStack>
                              </Box>
                            ))}
                          </BlockStack>
                        </Scrollable>
                      </Box>
                    </BlockStack>
                  ) : null}
                </BlockStack>
              ) : null}

              <InlineStack align="end">
                <Button
                  variant="primary"
                  disabled={!estimate}
                  loading={buyingCustom}
                  onClick={handleBuyCustom}
                >
                  {estimate ? `Buy ${estimate.credits} credits for $${customAmount}` : 'Buy'}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Purchase history would need a GET /api/transactions endpoint, which doesn't exist yet. */}
      </Layout>
    </Page>
  );
}
