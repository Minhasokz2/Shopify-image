import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Select,
  Button,
  Banner,
  Badge,
  Checkbox,
  Thumbnail,
  Spinner,
  Box,
  EmptyState,
} from '@shopify/polaris';
import { apiClient } from '../api/client.js';
import { CreditBalanceBadge } from '../components/CreditBalanceBadge.jsx';
import { useCreditBalance } from '../hooks/useCreditBalance.js';
import { StickyActionBar } from '../components/StickyActionBar.jsx';

const MAX_IMAGES = 6;
const NUM_IMAGES_OPTIONS = [1, 2, 3, 4];

function useAllowedModels() {
  return useQuery({
    queryKey: ['models', 'scene'],
    queryFn: () => apiClient.get('/api/models?category=scene'),
  });
}

// Custom-prompt scene generation: merchant selects one or more product images (across their
// selected products), writes their own prompt, and picks an admin-allowed model directly —
// the alternative to browsing fixed-prompt templates in TemplateGallery.
export default function CustomPromptStudio() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedProducts = location.state?.selectedProducts ?? [];

  const [selectedImageUrls, setSelectedImageUrls] = useState(() => new Set());
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [numImages, setNumImages] = useState('1');
  const [generateError, setGenerateError] = useState(null);

  const { data: modelsData, isLoading: modelsLoading, error: modelsError } = useAllowedModels();
  const { data: creditData } = useCreditBalance();
  const models = modelsData?.models ?? [];
  const selectedModel = models.find((m) => m.id === selectedModelId) ?? null;

  const isUnlimited = creditData?.plan === 'unlimited';
  const balance = creditData?.creditBalance ?? null;
  // Cost is per image, not per job — generating 3 images costs 3x one image, so the count picker
  // directly controls spend rather than always paying for a fixed batch the merchant didn't ask for.
  const totalCost = selectedModel ? selectedModel.creditCost * Number(numImages) : null;
  const canAfford = !selectedModel || isUnlimited || balance === null || balance >= totalCost;

  // Every image from every selected product, flattened, so the merchant can combine images
  // across products into one generation (e.g. "these two products together on a shelf").
  const availableImages = useMemo(() => {
    const seen = new Set();
    const images = [];
    for (const product of selectedProducts) {
      for (const url of product.images?.length ? product.images : product.imageUrl ? [product.imageUrl] : []) {
        if (seen.has(url)) continue;
        seen.add(url);
        images.push({ url, productTitle: product.title });
      }
    }
    return images;
  }, [selectedProducts]);

  const toggleImage = (url) => {
    setSelectedImageUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else if (next.size < MAX_IMAGES) {
        next.add(url);
      }
      return next;
    });
  };

  const tooManyForModel = selectedModel && !selectedModel.supportsMultiImage && selectedImageUrls.size > 1;

  const generateMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/api/generate', {
        productId: selectedProducts[0]?.id,
        contentType: 'scene',
        modelId: selectedModelId,
        customPrompt: customPrompt.trim(),
        imageUrls: Array.from(selectedImageUrls),
        numImages: Number(numImages),
        idempotencyKey: crypto.randomUUID(),
      }),
  });

  const handleGenerate = async () => {
    setGenerateError(null);
    try {
      const result = await generateMutation.mutateAsync();
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

  const canGenerate =
    selectedProducts.length > 0 &&
    selectedImageUrls.size > 0 &&
    customPrompt.trim().length > 0 &&
    Boolean(selectedModelId) &&
    !tooManyForModel &&
    canAfford;

  return (
    <Page
      title="Custom prompt"
      subtitle="Select reference images, write your own prompt, and pick a model"
      backAction={{ content: 'Back', onAction: () => navigate('/generate-method', { state: { selectedProducts } }) }}
      titleMetadata={<CreditBalanceBadge />}
    >
      <Layout>
        <Layout.Section>
          {selectedProducts.length === 0 ? (
            <Banner tone="warning" title="No product selected">
              <p>Go back and select at least one product before generating.</p>
            </Banner>
          ) : null}
          {generateError ? (
            <Banner tone="critical" title="Couldn't start generation" onDismiss={() => setGenerateError(null)}>
              <p>{generateError}</p>
            </Banner>
          ) : null}
          {modelsError ? (
            <Banner tone="critical" title="Couldn't load models">
              <p>{modelsError.message}</p>
            </Banner>
          ) : null}
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                1. Select reference images ({selectedImageUrls.size}/{MAX_IMAGES})
              </Text>
              {availableImages.length === 0 ? (
                <EmptyState heading="No images available" image="">
                  <p>The selected product(s) have no images.</p>
                </EmptyState>
              ) : (
                <InlineStack gap="300" wrap>
                  {availableImages.map(({ url, productTitle }) => (
                    <Box key={url} padding="200" borderWidth="025" borderColor="border" borderRadius="200">
                      <BlockStack gap="150" inlineAlign="center">
                        <Checkbox
                          label={`Select image from ${productTitle}`}
                          labelHidden
                          checked={selectedImageUrls.has(url)}
                          disabled={!selectedImageUrls.has(url) && selectedImageUrls.size >= MAX_IMAGES}
                          onChange={() => toggleImage(url)}
                        />
                        <Thumbnail source={url} alt={productTitle} size="large" />
                        <Text as="span" variant="bodySm" tone="subdued">
                          {productTitle}
                        </Text>
                      </BlockStack>
                    </Box>
                  ))}
                </InlineStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                2. Write your prompt
              </Text>
              <TextField
                label="Prompt"
                labelHidden
                placeholder="e.g. Place the product on a rustic wooden table with warm morning light"
                value={customPrompt}
                onChange={setCustomPrompt}
                multiline={4}
                autoComplete="off"
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                3. Choose a model and how many images
              </Text>
              {modelsLoading ? (
                <InlineStack align="center">
                  <Spinner accessibilityLabel="Loading models" size="small" />
                </InlineStack>
              ) : models.length === 0 ? (
                <EmptyState heading="No models available" image="">
                  <p>Ask the platform admin to enable at least one model for custom prompts.</p>
                </EmptyState>
              ) : (
                <>
                  <Select
                    label="Model"
                    options={[
                      { label: 'Select a model…', value: '' },
                      ...models.map((m) => ({ label: `${m.label} (${m.creditCost} credit${m.creditCost === 1 ? '' : 's'}/image)`, value: m.id })),
                    ]}
                    value={selectedModelId}
                    onChange={setSelectedModelId}
                  />

                  {selectedModel ? (
                    <Select
                      label="Number of images to generate"
                      helpText="Cost is per image — generating more only costs more if you actually want more."
                      options={NUM_IMAGES_OPTIONS.map((n) => ({
                        label: `${n} image${n === 1 ? '' : 's'} — ${n * selectedModel.creditCost} credits total`,
                        value: String(n),
                      }))}
                      value={numImages}
                      onChange={setNumImages}
                    />
                  ) : null}

                  {selectedModel ? (
                    <InlineStack gap="150">
                      <Badge tone={canAfford ? undefined : 'critical'}>{`${totalCost} credits total`}</Badge>
                      {selectedModel.supportsMultiImage ? <Badge tone="info">Supports multiple images</Badge> : null}
                    </InlineStack>
                  ) : null}
                  {tooManyForModel ? (
                    <Text as="span" tone="critical">
                      This model only supports a single reference image — deselect extra images or pick a different
                      model.
                    </Text>
                  ) : null}
                  {selectedModel && !canAfford ? (
                    <Text as="span" tone="critical">
                      Not enough credits ({balance} left, need {totalCost}).
                    </Text>
                  ) : null}
                </>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

      </Layout>

      <StickyActionBar edge="bottom">
        <InlineStack align="end">
          <Button variant="primary" size="large" loading={generateMutation.isPending} disabled={!canGenerate} onClick={handleGenerate}>
            Generate
          </Button>
        </InlineStack>
      </StickyActionBar>
    </Page>
  );
}
