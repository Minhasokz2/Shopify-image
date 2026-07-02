import { useEffect, useState } from 'react';
import { BlockStack, Banner, Button, Card, InlineStack, Layout, Page, Text, TextField } from '@shopify/polaris';
import { useQueryClient } from '@tanstack/react-query';
import { useCreditBalance } from '../hooks/useCreditBalance.js';
import { apiClient } from '../api/client.js';

const PACKS = [
  { id: 'starter', name: 'Starter', priceLabel: '$9', credits: 50 },
  { id: 'growth', name: 'Growth', priceLabel: '$29', credits: 200 },
  { id: 'pro', name: 'Pro', priceLabel: '$69', credits: 600 },
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
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                Current plan
              </Text>
              {creditsLoading ? (
                <Text as="span" tone="subdued">
                  Loading…
                </Text>
              ) : (
                <Text as="span">
                  {credits?.plan ?? 'free'} plan · {credits?.creditBalance ?? 0} credits remaining
                </Text>
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
          <InlineStack gap="400" wrap>
            {PACKS.map((pack) => (
              <div key={pack.id} style={{ flex: '1 1 200px', minWidth: 200 }}>
                <Card>
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">
                      {pack.name}
                    </Text>
                    <Text as="p" variant="heading2xl">
                      {pack.priceLabel}
                    </Text>
                    <Text as="p" tone="subdued">
                      {pack.credits} credits
                    </Text>
                    <Button
                      variant="primary"
                      onClick={() => handlePurchase(pack.id)}
                      loading={pendingPackId === pack.id}
                    >
                      Buy
                    </Button>
                  </BlockStack>
                </Card>
              </div>
            ))}
          </InlineStack>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h3" variant="headingSm">
                Buy a custom amount
              </Text>
              <Text as="p" tone="subdued">
                Enter any amount between $5 and $2,000 — credits are priced live so this always
                stays profitable, no matter which model you spend them on.
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
                <Text as="span" tone="subdued">
                  Calculating…
                </Text>
              ) : estimateError ? (
                <Text as="span" tone="critical">
                  {estimateError}
                </Text>
              ) : estimate ? (
                <BlockStack gap="100">
                  <Text as="span" fontWeight="semibold">
                    {`${estimate.credits} credits`}
                  </Text>
                  <Text as="span" tone="subdued" variant="bodySm">
                    {`~$${estimate.pricePerCredit.toFixed(3)}/credit — priced to guarantee at least a ${estimate.marginPct}% margin on our end, even if you spend every credit on our priciest active model.`}
                  </Text>
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
