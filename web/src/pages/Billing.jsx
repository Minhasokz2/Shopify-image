import { useState } from 'react';
import { BlockStack, Banner, Button, Card, InlineStack, Layout, Page, Text } from '@shopify/polaris';
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

export default function Billing() {
  const { data: credits, isLoading: creditsLoading } = useCreditBalance();
  const [pendingPackId, setPendingPackId] = useState(null);
  const [subscribing, setSubscribing] = useState(false);
  const [error, setError] = useState(null);

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

  const handleSubscribe = async () => {
    setError(null);
    setSubscribing(true);
    try {
      const data = await apiClient.post('/api/billing/subscribe', {});
      redirectToConfirmation(data.confirmationUrl);
    } catch (err) {
      setError(err.message);
      setSubscribing(false);
    }
  };

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
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h3" variant="headingSm">
                  Unlimited
                </Text>
                <Text as="p" tone="subdued">
                  $29/mo for unlimited generations, no credit tracking.
                </Text>
              </BlockStack>
              <Button onClick={handleSubscribe} loading={subscribing}>
                Subscribe
              </Button>
            </InlineStack>
          </Card>
        </Layout.Section>

        {/* Purchase history would need a GET /api/transactions endpoint, which doesn't exist yet. */}
      </Layout>
    </Page>
  );
}
