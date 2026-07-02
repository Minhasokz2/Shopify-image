import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Page,
  Layout,
  Card,
  Modal,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Badge,
  Banner,
  Button,
  DropZone,
  Thumbnail,
  Spinner,
  Box,
  EmptyState,
} from '@shopify/polaris';
import { apiClient } from '../api/client.js';
import { CreditBalanceBadge } from '../components/CreditBalanceBadge.jsx';
import { useCreditBalance } from '../hooks/useCreditBalance.js';
import { StickyActionBar } from '../components/StickyActionBar.jsx';

function useTryOnModel() {
  return useQuery({
    queryKey: ['models', 'scene'],
    queryFn: () => apiClient.get('/api/models?category=scene'),
    select: (data) => data.models?.find((m) => m.id === 'fashn-tryon') ?? null,
  });
}

function useProducts(cursor) {
  return useQuery({
    queryKey: ['products', cursor ?? null],
    queryFn: () => {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      const qs = params.toString();
      return apiClient.get(`/api/products${qs ? `?${qs}` : ''}`);
    },
  });
}

// The garment must come from an existing Shopify product, not an arbitrary upload — its
// productId is reused later if the merchant publishes the try-on result back to Shopify as an
// on-model shot for that product (same pattern as UGC content, see GenerationReview.jsx). An
// uploaded garment image would have no real product to attach that publish to.
export default function VirtualTryOn() {
  const navigate = useNavigate();

  const [personImageUrl, setPersonImageUrl] = useState(null);
  const [garmentImageUrl, setGarmentImageUrl] = useState(null);
  const [garmentProductId, setGarmentProductId] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productCursor, setProductCursor] = useState(undefined);
  const [allProducts, setAllProducts] = useState([]);
  const [uploadError, setUploadError] = useState(null);
  const [generateError, setGenerateError] = useState(null);

  const { data: tryOnModel } = useTryOnModel();
  const { data: creditData } = useCreditBalance();
  const isUnlimited = creditData?.plan === 'unlimited';
  const balance = creditData?.creditBalance ?? null;
  const canAfford = isUnlimited || balance === null || !tryOnModel || balance >= tryOnModel.creditCost;

  const { data: productsPage, isLoading: productsLoading, error: productsError } = useProducts(productCursor);

  const products = useMemo(() => {
    const seen = new Map();
    for (const p of allProducts) seen.set(p.id, p);
    for (const p of productsPage?.products ?? []) seen.set(p.id, p);
    return Array.from(seen.values());
  }, [allProducts, productsPage]);

  // Every product's images, flattened into one searchable grid — picking a garment is picking
  // one specific image, not a whole product, and most shops' products only have a handful of
  // images anyway, so a two-step "pick product, then pick image" flow would be one click too many.
  const garmentImageOptions = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    const options = [];
    for (const product of products) {
      if (term && !product.title.toLowerCase().includes(term)) continue;
      const images = product.images?.length ? product.images : product.imageUrl ? [product.imageUrl] : [];
      for (const url of images) options.push({ url, productId: product.id, productTitle: product.title });
    }
    return options;
  }, [products, productSearch]);

  const loadMoreProducts = () => {
    if (productsPage?.products) {
      setAllProducts((prev) => {
        const seen = new Map(prev.map((p) => [p.id, p]));
        for (const p of productsPage.products) seen.set(p.id, p);
        return Array.from(seen.values());
      });
    }
    setProductCursor(productsPage?.pageInfo?.endCursor);
  };

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiClient.postFormData('/api/uploads/reference-image', formData);
    },
  });

  const handleDropPersonPhoto = async (_dropFiles, acceptedFiles) => {
    setUploadError(null);
    const file = acceptedFiles[0];
    if (!file) return;
    try {
      const result = await uploadMutation.mutateAsync(file);
      setPersonImageUrl(result.imageUrl);
    } catch (err) {
      setUploadError(err.message);
    }
  };

  const handleSelectGarment = ({ url, productId }) => {
    setGarmentImageUrl(url);
    setGarmentProductId(productId);
    setPickerOpen(false);
  };

  const generateMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/api/generate', {
        productId: garmentProductId,
        contentType: 'scene',
        modelId: 'fashn-tryon',
        // Unused by fashn-tryon's request shape (see fal.js's dual_image handling) but required by
        // the shared job-creation schema, which expects every custom-prompt job to carry a prompt.
        customPrompt: 'Fit the garment onto the person exactly as shown.',
        imageUrls: [personImageUrl, garmentImageUrl],
        numImages: 1,
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

  const canGenerate = Boolean(personImageUrl) && Boolean(garmentImageUrl) && Boolean(garmentProductId) && canAfford;

  return (
    <Page
      title="Virtual Try-On"
      subtitle="Fit a garment from your catalog onto a person photo"
      backAction={{ content: 'Back', onAction: () => navigate(-1) }}
      titleMetadata={<CreditBalanceBadge />}
    >
      <Layout>
        <Layout.Section>
          {uploadError ? (
            <Banner tone="critical" title="Upload failed" onDismiss={() => setUploadError(null)}>
              <p>{uploadError}</p>
            </Banner>
          ) : null}
          {generateError ? (
            <Banner tone="critical" title="Couldn't start generation" onDismiss={() => setGenerateError(null)}>
              <p>{generateError}</p>
            </Banner>
          ) : null}
        </Layout.Section>

        <Layout.Section>
          <InlineStack gap="400" wrap>
            <Box minWidth="300px" width="100%">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Person
                  </Text>
                  {personImageUrl ? (
                    <InlineStack gap="300" blockAlign="center">
                      <Thumbnail source={personImageUrl} alt="Person photo" size="large" />
                      <Button onClick={() => setPersonImageUrl(null)}>Replace</Button>
                    </InlineStack>
                  ) : (
                    <DropZone accept="image/*" type="image" onDrop={handleDropPersonPhoto}>
                      <DropZone.FileUpload
                        actionTitle="Drag or upload your person photo"
                        actionHint="Supports JPG, JPEG, PNG, WEBP, up to 20MB"
                      />
                    </DropZone>
                  )}
                  {uploadMutation.isPending ? (
                    <InlineStack align="center">
                      <Spinner accessibilityLabel="Uploading" size="small" />
                    </InlineStack>
                  ) : null}
                </BlockStack>
              </Card>
            </Box>

            <Box minWidth="300px" width="100%">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Garment
                  </Text>
                  {garmentImageUrl ? (
                    <InlineStack gap="300" blockAlign="center">
                      <Thumbnail source={garmentImageUrl} alt="Garment photo" size="large" />
                      <Button
                        onClick={() => {
                          setGarmentImageUrl(null);
                          setGarmentProductId(null);
                        }}
                      >
                        Replace
                      </Button>
                    </InlineStack>
                  ) : (
                    <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                      <BlockStack gap="300" inlineAlign="center">
                        <Text as="p" tone="subdued">
                          Pick the product image you want to try on the person above.
                        </Text>
                        <Button onClick={() => setPickerOpen(true)}>Choose from your products</Button>
                      </BlockStack>
                    </Box>
                  )}
                </BlockStack>
              </Card>
            </Box>
          </InlineStack>
        </Layout.Section>

        {tryOnModel ? (
          <Layout.Section>
            <InlineStack gap="150">
              <Badge tone={canAfford ? undefined : 'critical'}>
                {`${tryOnModel.creditCost} credit${tryOnModel.creditCost === 1 ? '' : 's'}`}
              </Badge>
              {!canAfford ? (
                <Text as="span" tone="critical">
                  Not enough credits ({balance} left).
                </Text>
              ) : null}
            </InlineStack>
          </Layout.Section>
        ) : null}
      </Layout>

      {pickerOpen ? (
        <Modal open onClose={() => setPickerOpen(false)} title="Choose a garment image" size="large">
          <Modal.Section>
            <BlockStack gap="300">
              <TextField
                label="Search products"
                labelHidden
                placeholder="Search by title"
                value={productSearch}
                onChange={setProductSearch}
                autoComplete="off"
                clearButton
                onClearButtonClick={() => setProductSearch('')}
              />

              {productsError ? (
                <Banner tone="critical" title="Couldn't load products">
                  <p>{productsError.message}</p>
                </Banner>
              ) : null}

              {productsLoading && products.length === 0 ? (
                <InlineStack align="center">
                  <Spinner accessibilityLabel="Loading products" size="small" />
                </InlineStack>
              ) : garmentImageOptions.length === 0 ? (
                <EmptyState heading="No product images found" image="">
                  <p>Try a different search term.</p>
                </EmptyState>
              ) : (
                <InlineStack gap="300" wrap>
                  {garmentImageOptions.map(({ url, productId, productTitle }) => (
                    <Box key={url} padding="150" borderWidth="025" borderColor="border" borderRadius="200">
                      <Button variant="plain" onClick={() => handleSelectGarment({ url, productId })}>
                        <BlockStack gap="100" inlineAlign="center">
                          <Thumbnail source={url} alt={productTitle} size="large" />
                          <Text as="span" variant="bodySm" tone="subdued">
                            {productTitle}
                          </Text>
                        </BlockStack>
                      </Button>
                    </Box>
                  ))}
                </InlineStack>
              )}

              {productsPage?.pageInfo?.hasNextPage ? (
                <InlineStack align="center">
                  <Button onClick={loadMoreProducts} loading={productsLoading}>
                    Load more
                  </Button>
                </InlineStack>
              ) : null}
            </BlockStack>
          </Modal.Section>
        </Modal>
      ) : null}

      <StickyActionBar edge="bottom">
        <InlineStack align="end">
          <Button
            variant="primary"
            size="large"
            loading={generateMutation.isPending}
            disabled={!canGenerate}
            onClick={handleGenerate}
          >
            Generate try-on
          </Button>
        </InlineStack>
      </StickyActionBar>
    </Page>
  );
}
