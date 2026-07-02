import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BlockStack, Banner, Box, Button, Card, InlineStack, Layout, Page, ProgressBar, Text } from '@shopify/polaris';
import { CreditCardIcon, ImagesIcon } from '@shopify/polaris-icons';
import { apiClient } from '../api/client.js';
import { SectionHeading } from '../components/SectionHeading.jsx';
import { useImageOptimizerUsage } from '../hooks/useImageOptimizer.js';

// Shopify's billing confirmation page must break out of the embedded admin iframe — same
// approach as web/src/pages/Billing.jsx's redirectToConfirmation.
function redirectToConfirmation(confirmationUrl) {
  window.top.location.href = confirmationUrl;
}

export default function ImageOptimizerSettings() {
  const navigate = useNavigate();
  const { data: usage, isLoading } = useImageOptimizerUsage();
  const [error, setError] = useState(null);

  const subscribeMutation = useMutation({
    mutationFn: () => apiClient.post('/api/image-optimizer/billing/subscribe', {}),
  });

  const handleSubscribe = async () => {
    setError(null);
    try {
      const data = await subscribeMutation.mutateAsync();
      redirectToConfirmation(data.confirmationUrl);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Page
      title="Compress Image — Settings & Plans"
      backAction={{ content: 'Convert Images', onAction: () => navigate('/image-optimizer') }}
    >
      <Layout>
        {error ? (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => setError(null)}>
              {error}
            </Banner>
          </Layout.Section>
        ) : null}

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <SectionHeading icon={CreditCardIcon}>Current plan</SectionHeading>
                {isLoading ? (
                  <Text as="span" tone="subdued">
                    Loading…
                  </Text>
                ) : (
                  <Text as="span">{usage?.unlimited ? 'Unlimited' : 'Free'}</Text>
                )}
              </InlineStack>
              {!isLoading && !usage?.unlimited ? (
                <BlockStack gap="150">
                  <Text as="p" tone="subdued">
                    {usage?.dailyUsed ?? 0} of {usage?.dailyLimit ?? 10} free conversions used today.
                  </Text>
                  <ProgressBar
                    progress={((usage?.remaining ?? 0) / (usage?.dailyLimit || 10)) * 100}
                    size="small"
                    tone={(usage?.remaining ?? 0) === 0 ? 'critical' : 'primary'}
                  />
                </BlockStack>
              ) : null}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <SectionHeading icon={ImagesIcon}>Usage</SectionHeading>
              <InlineStack gap="600" wrap>
                <BlockStack gap="050">
                  <Text as="span" variant="heading2xl">
                    {usage?.totalConverted ?? 0}
                  </Text>
                  <Text as="span" tone="subdued">
                    Total images converted
                  </Text>
                </BlockStack>
                <BlockStack gap="050">
                  <Text as="span" variant="heading2xl">
                    {Math.round((usage?.totalSavedBytes ?? 0) / 1024)} KB
                  </Text>
                  <Text as="span" tone="subdued">
                    Total size saved
                  </Text>
                </BlockStack>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {!usage?.unlimited ? (
          <Layout.Section>
            <Card>
              <Box background="bg-surface-secondary" padding="400" borderRadius="300">
                <InlineStack align="space-between" blockAlign="center" gap="400" wrap>
                  <BlockStack gap="100">
                    <Text as="h3" variant="headingSm">
                      Compress Image unlimited
                    </Text>
                    <Text as="p" variant="heading2xl">
                      $2.99/mo
                    </Text>
                    <Text as="p" tone="subdued">
                      Unlimited image conversions, no daily cap. 7-day free trial.
                    </Text>
                  </BlockStack>
                  <Button variant="primary" icon={CreditCardIcon} onClick={handleSubscribe} loading={subscribeMutation.isPending}>
                    Start free trial
                  </Button>
                </InlineStack>
              </Box>
            </Card>
          </Layout.Section>
        ) : (
          <Layout.Section>
            <Banner tone="success" title="Unlimited conversions active">
              <p>The daily free-tier cap doesn't apply to your shop.</p>
            </Banner>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
