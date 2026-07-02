import { useEffect, useMemo, useRef, useState } from 'react';
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
import { PersonIcon } from '@shopify/polaris-icons';
import { apiClient } from '../api/client.js';
import { CreditBalanceBadge } from '../components/CreditBalanceBadge.jsx';
import { useCreditBalance } from '../hooks/useCreditBalance.js';
import { SectionHeading } from '../components/SectionHeading.jsx';

// UGC and video are temporarily hidden from merchants — their providers (OpenAI, WaveSpeed)
// aren't configured with real credentials yet. Re-add { id: 'ugc', content: 'UGC' } and
// { id: 'video', content: 'Video' } once they are; nothing else needs to change, the
// backend/admin CMS for both still fully exists.
//
// Virtual Try-On isn't blocked on that — it runs on fal.ai (already configured) — but it isn't a
// templatesRepo-backed template either: it needs a guided 2-image flow (person upload + garment
// pick) a fixed prompt+model template row can't express. It gets its own tab that skips the
// template grid entirely and hands off straight to VirtualTryOn.jsx. That tab is only added below
// once fashn-tryon is confirmed to be an active Allowed Model — merchants should never see an
// entry point for a model the platform admin hasn't actually enabled/priced.
const BASE_TABS = [{ id: 'scene', content: 'Scenes' }];

// The template/model catalogs are admin-managed and can change at any time from a completely
// separate app (the admin CMS) — the global 10s staleTime (main.jsx) is fine for data a merchant
// changes themselves, but it's the wrong default here: a template added moments ago shouldn't
// require a full page reload (or a 10s wait) to show up. staleTime: 0 means every mount/focus
// re-checks the server instead of trusting a cached copy, and the interval keeps it current even
// if the merchant just leaves this tab open.
const ALWAYS_FRESH = { staleTime: 0, refetchOnWindowFocus: true, refetchInterval: 30_000 };

function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: () => apiClient.get('/api/templates'),
    ...ALWAYS_FRESH,
  });
}

function useTryOnModel() {
  return useQuery({
    queryKey: ['models', 'scene'],
    queryFn: () => apiClient.get('/api/models?category=scene'),
    select: (data) => data.models?.find((m) => m.id === 'fashn-tryon') ?? null,
    ...ALWAYS_FRESH,
  });
}

export default function TemplateGallery() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedProducts = location.state?.selectedProducts ?? [];
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);
  const { data, isLoading, error } = useTemplates();
  const { data: tryOnModel } = useTryOnModel();
  const { data: creditData } = useCreditBalance();
  const [generateError, setGenerateError] = useState(null);

  // Unlimited-plan shops never run short, so cost-vs-balance comparisons only apply to
  // metered plans — server-side this same distinction lives in creditLedger.assertSufficientCredits.
  const isUnlimited = creditData?.plan === 'unlimited';
  const balance = creditData?.creditBalance ?? null;
  const tryOnCanAfford = isUnlimited || balance === null || !tryOnModel || balance >= tryOnModel.creditCost;

  const tabs = tryOnModel ? [...BASE_TABS, { id: 'tryon', content: 'Virtual Try-On' }] : BASE_TABS;
  const activeCategory = tabs[selectedTabIndex]?.id ?? 'scene';

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

  // Template-first flow: a merchant can browse and pick a template before ever choosing a
  // product. If none is selected yet, send them to pick one and come straight back here with
  // `autoGenerateTemplateId` set — the effect below then re-runs this exact function against the
  // now-selected product, so picking a template first feels like one continuous action rather
  // than "pick a template, get bounced to Products with no memory of what you clicked."
  const handleSelectTemplate = async (template) => {
    setGenerateError(null);
    const primaryProduct = selectedProducts[0];

    if (!primaryProduct) {
      navigate('/products', { state: { returnTo: 'templates', pendingTemplateId: template.id } });
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

  // VirtualTryOn.jsx is fully self-contained (its own person upload + product-image picker) —
  // this tab is just a discoverability shortcut for merchants already browsing Templates.
  const handleContinueToTryOn = () => navigate('/try-on');

  // Fires once, after ProductPicker sends the merchant back here with a product selected on
  // behalf of a template they clicked before one was chosen — completes that original click
  // instead of leaving them to re-find and re-click the same template card.
  const autoGeneratedRef = useRef(false);
  useEffect(() => {
    const pendingId = location.state?.autoGenerateTemplateId;
    if (!pendingId || autoGeneratedRef.current || selectedProducts.length === 0) return;
    const match = (data?.templates ?? []).find((t) => t.id === pendingId);
    if (!match) return; // templates still loading, or the id no longer exists — nothing to do yet
    autoGeneratedRef.current = true;
    const matchTabIndex = tabs.findIndex((t) => t.id === match.category);
    if (matchTabIndex >= 0) setSelectedTabIndex(matchTabIndex);
    handleSelectTemplate(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, location.state]);

  return (
    <Page
      title="Choose a template"
      subtitle={
        selectedProducts.length > 0
          ? `Applying to ${selectedProducts.length} selected product${selectedProducts.length > 1 ? 's' : ''}`
          : "Pick a template — you'll choose a product for it next"
      }
      backAction={{ content: 'Products', onAction: () => navigate('/products') }}
      titleMetadata={<CreditBalanceBadge />}
    >
      <BlockStack gap="400">
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
          {tabs.length > 1 ? <Tabs tabs={tabs} selected={selectedTabIndex} onSelect={setSelectedTabIndex} /> : null}
          <Box padding="400">
            {activeCategory === 'tryon' ? (
              <BlockStack gap="300">
                <SectionHeading icon={PersonIcon} variant="headingSm">
                  Virtual Try-On
                </SectionHeading>
                <Box background="bg-surface-secondary" padding="400" borderRadius="300">
                  <BlockStack gap="300">
                    <Text as="p" tone="subdued">
                      Upload a photo of a person and pick a garment product image — see the garment
                      fitted onto the person, powered by FASHN.
                    </Text>
                    {tryOnModel ? (
                      <InlineStack gap="150">
                        <Badge tone={tryOnCanAfford ? undefined : 'critical'}>
                          {`${tryOnModel.creditCost} credit${tryOnModel.creditCost === 1 ? '' : 's'}`}
                        </Badge>
                      </InlineStack>
                    ) : null}
                    {!tryOnCanAfford ? (
                      <Text as="span" variant="bodySm" tone="critical">
                        Not enough credits ({balance} left)
                      </Text>
                    ) : null}
                    <Box>
                      <Button variant="primary" onClick={handleContinueToTryOn} disabled={!tryOnCanAfford}>
                        {!tryOnCanAfford ? 'Top up to use' : 'Open Virtual Try-On'}
                      </Button>
                    </Box>
                  </BlockStack>
                </Box>
              </BlockStack>
            ) : isLoading ? (
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
                      borderWidth="025"
                      borderColor="border"
                      borderRadius="200"
                      overflowX="hidden"
                      overflowY="hidden"
                      background="bg-surface"
                      minWidth="220px"
                      maxWidth="220px"
                    >
                      <BlockStack gap="0">
                        <div style={{ position: 'relative' }}>
                          {template.thumbnailUrl ? (
                            <img
                              src={template.thumbnailUrl}
                              alt={template.name}
                              style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
                            />
                          ) : (
                            <Box background="bg-surface-secondary" minHeight="160px" padding="0">
                              <div
                                style={{
                                  height: 160,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                <Text as="span" tone="subdued" variant="bodySm">
                                  No preview
                                </Text>
                              </div>
                            </Box>
                          )}
                          <div
                            style={{
                              position: 'absolute',
                              top: 8,
                              right: 8,
                              padding: '3px 10px',
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 600,
                              color: '#fff',
                              // A fixed, opaque dark pill (not a Polaris Badge tone) — this sits on
                              // top of an arbitrary admin-uploaded photo, so it needs to read
                              // clearly regardless of how light/busy that image is, rather than
                              // risk blending into a similarly light Badge-tone background.
                              backgroundColor: canAfford ? 'rgba(17, 17, 17, 0.85)' : 'rgba(185, 28, 28, 0.9)',
                            }}
                          >
                            {`${template.creditCost} credits`}
                          </div>
                        </div>

                        <Box padding="300">
                          <BlockStack gap="200">
                            <Text as="h3" fontWeight="medium">
                              {template.name}
                            </Text>
                            {template.setting ? <Badge tone="info">{template.setting}</Badge> : null}
                            {!canAfford ? (
                              <Text as="span" variant="bodySm" tone="critical">
                                Not enough credits ({balance} left)
                              </Text>
                            ) : null}
                            <Button
                              onClick={() => handleSelectTemplate(template)}
                              loading={generateMutation.isPending}
                              disabled={!canAfford}
                              fullWidth
                            >
                              {!canAfford
                                ? 'Top up to use'
                                : selectedProducts.length === 0
                                  ? 'Select product'
                                  : template.category === 'scene'
                                    ? 'Generate'
                                    : 'Continue'}
                            </Button>
                          </BlockStack>
                        </Box>
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
