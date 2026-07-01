import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Badge,
  Banner,
  Spinner,
  EmptyState,
  Tabs,
  Button,
  Box,
} from '@shopify/polaris';
import { apiClient } from '../api/client.js';
import { CreditBalanceBadge } from '../components/CreditBalanceBadge.jsx';
import { useCreditBalance } from '../hooks/useCreditBalance.js';

// UGC and video are temporarily hidden from merchants — their providers (OpenAI, WaveSpeed)
// aren't configured with real credentials yet. Re-add { id: 'ugc', content: 'UGC' } and
// { id: 'video', content: 'Video' } once they are; nothing else needs to change, the
// backend/admin CMS for both still fully exists.
const TABS = [{ id: 'scene', content: 'Scenes' }];

function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: () => apiClient.get('/api/templates'),
  });
}

export default function TemplateGallery() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedProducts = location.state?.selectedProducts ?? [];
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);
  const { data, isLoading, error } = useTemplates();
  const { data: creditData } = useCreditBalance();
  const [generateError, setGenerateError] = useState(null);

  // Unlimited-plan shops never run short, so cost-vs-balance comparisons only apply to
  // metered plans — server-side this same distinction lives in creditLedger.assertSufficientCredits.
  const isUnlimited = creditData?.plan === 'unlimited';
  const balance = creditData?.creditBalance ?? null;

  const activeCategory = TABS[selectedTabIndex].id;

  const templates = useMemo(
    () => (data?.templates ?? []).filter((t) => t.category === activeCategory),
    [data, activeCategory],
  );

  const generateMutation = useMutation({
    mutationFn: ({ product, template }) =>
      apiClient.post('/api/generate', {
        productId: product.id,
        imageUrl: product.imageUrl,
        contentType: 'scene',
        templateId: template.id,
        productCategoryTag: product.productCategoryTag ?? undefined,
        idempotencyKey: crypto.randomUUID(),
      }),
  });

  const handleSelectTemplate = async (template) => {
    setGenerateError(null);
    const primaryProduct = selectedProducts[0];

    if (!primaryProduct) {
      setGenerateError('Select a product first.');
      navigate('/products');
      return;
    }

    if (template.category === 'ugc') {
      navigate('/persona', { state: { product: primaryProduct, template } });
      return;
    }

    if (template.category === 'video') {
      navigate('/video-studio', { state: { product: primaryProduct, template } });
      return;
    }

    try {
      const result = await generateMutation.mutateAsync({ product: primaryProduct, template });
      navigate(`/review/${result.jobId}`);
    } catch (err) {
      if (err.statusCode === 402) {
        setGenerateError('Insufficient credits. Visit the Billing page to top up.');
      } else if (err.statusCode === 429) {
        setGenerateError('Too many generations running at once. Please wait for one to finish and try again.');
      } else {
        setGenerateError(err.message || 'Failed to start generation.');
      }
    }
  };

  return (
    <Page
      title="Choose a template"
      subtitle={
        selectedProducts.length > 0
          ? `Applying to ${selectedProducts.length} selected product${selectedProducts.length > 1 ? 's' : ''}`
          : 'No products selected'
      }
      backAction={{ content: 'Products', onAction: () => navigate('/products') }}
      titleMetadata={<CreditBalanceBadge />}
    >
      <BlockStack gap="400">
        {selectedProducts.length === 0 ? (
          <Banner tone="warning" title="No product selected">
            <p>Go back and select at least one product before generating.</p>
          </Banner>
        ) : null}

        {error ? (
          <Banner tone="critical" title="Couldn't load templates">
            <p>{error.message}</p>
          </Banner>
        ) : null}

        {generateError ? (
          <Banner tone="critical" title="Couldn't start generation" onDismiss={() => setGenerateError(null)}>
            <p>{generateError}</p>
          </Banner>
        ) : null}

        <Card padding="0">
          {TABS.length > 1 ? <Tabs tabs={TABS} selected={selectedTabIndex} onSelect={setSelectedTabIndex} /> : null}
          <Box padding="400">
            {isLoading ? (
              <InlineStack align="center">
                <Spinner accessibilityLabel="Loading templates" size="small" />
              </InlineStack>
            ) : templates.length === 0 ? (
              <EmptyState heading="No templates in this category" image="">
                <p>Check back later.</p>
              </EmptyState>
            ) : (
              <InlineStack gap="300" wrap>
                {templates.map((template) => {
                  // A soft, client-side heads-up only — the server always re-checks the real
                  // balance in creditLedger.assertSufficientCredits before a job is created.
                  const canAfford = isUnlimited || balance === null || balance >= template.creditCost;
                  return (
                    <Box
                      key={template.id}
                      padding="300"
                      borderWidth="025"
                      borderColor="border"
                      borderRadius="200"
                      minWidth="220px"
                    >
                      <BlockStack gap="200">
                        <Text as="h3" fontWeight="medium">
                          {template.name}
                        </Text>
                        <InlineStack gap="150">
                          <Badge tone={canAfford ? undefined : 'critical'}>{`${template.creditCost} credits`}</Badge>
                          {template.setting ? <Badge tone="info">{template.setting}</Badge> : null}
                        </InlineStack>
                        {!canAfford ? (
                          <Text as="span" variant="bodySm" tone="critical">
                            Not enough credits ({balance} left)
                          </Text>
                        ) : null}
                        <Button
                          onClick={() => handleSelectTemplate(template)}
                          loading={generateMutation.isPending}
                          disabled={selectedProducts.length === 0 || !canAfford}
                        >
                          {!canAfford ? 'Top up to use' : template.category === 'scene' ? 'Generate' : 'Continue'}
                        </Button>
                      </BlockStack>
                    </Box>
                  );
                })}
              </InlineStack>
            )}
          </Box>
        </Card>
      </BlockStack>
    </Page>
  );
}
