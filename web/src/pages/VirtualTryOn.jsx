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
  Badge,
  Banner,
  Button,
  DropZone,
  RadioButton,
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

// FASHN Virtual Try-On needs two distinct image roles — a person photo, then a garment photo —
// not a list of interchangeable references like the rest of the custom-prompt catalog (see
// fal.js's 'dual_image' handling). The person photo almost never exists in the merchant's Shopify
// catalog, so this page adds real file upload (POST /api/uploads/reference-image) instead of
// reusing ProductPicker's catalog-only image grid. It still runs through the same custom-prompt
// job pipeline as everything else (POST /api/generate with modelId: 'fashn-tryon') — this page
// just builds the right 2-image input for it through a guided, template-like flow instead of
// exposing the generic model/prompt picker, which has no way to label which image is which role.
export default function VirtualTryOn() {
  const navigate = useNavigate();
  const location = useLocation();
  const product = location.state?.product ?? null;

  const [personImageUrl, setPersonImageUrl] = useState(null);
  const [garmentImageUrl, setGarmentImageUrl] = useState(product?.imageUrl ?? null);
  const [uploadError, setUploadError] = useState(null);
  const [generateError, setGenerateError] = useState(null);

  const { data: tryOnModel } = useTryOnModel();
  const { data: creditData } = useCreditBalance();
  const isUnlimited = creditData?.plan === 'unlimited';
  const balance = creditData?.creditBalance ?? null;
  const canAfford = isUnlimited || balance === null || !tryOnModel || balance >= tryOnModel.creditCost;

  const garmentImages = useMemo(
    () => (product?.images?.length ? product.images : product?.imageUrl ? [product.imageUrl] : []),
    [product],
  );

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

  const generateMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/api/generate', {
        productId: product.id,
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

  const canGenerate = Boolean(product) && Boolean(personImageUrl) && Boolean(garmentImageUrl) && canAfford;

  return (
    <Page
      title="Virtual Try-On"
      subtitle={product ? `Garment from ${product.title}` : undefined}
      backAction={{ content: 'Templates', onAction: () => navigate('/templates') }}
      titleMetadata={<CreditBalanceBadge />}
    >
      <Layout>
        <Layout.Section>
          {!product ? (
            <Banner tone="warning" title="No product selected">
              <p>Select a product with a garment image to continue.</p>
              <Button onClick={() => navigate('/products', { state: { returnTo: 'tryon' } })}>Select a product</Button>
            </Banner>
          ) : null}
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
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                1. Upload a person photo
              </Text>
              {personImageUrl ? (
                <InlineStack gap="300" blockAlign="center">
                  <Thumbnail source={personImageUrl} alt="Person photo" size="large" />
                  <Button onClick={() => setPersonImageUrl(null)}>Replace</Button>
                </InlineStack>
              ) : (
                <DropZone accept="image/*" type="image" onDrop={handleDropPersonPhoto}>
                  <DropZone.FileUpload />
                </DropZone>
              )}
              {uploadMutation.isPending ? (
                <InlineStack align="center">
                  <Spinner accessibilityLabel="Uploading" size="small" />
                </InlineStack>
              ) : null}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                2. Choose the garment image
              </Text>
              {garmentImages.length === 0 ? (
                <EmptyState heading="No images available" image="">
                  <p>The selected product has no images.</p>
                </EmptyState>
              ) : (
                <InlineStack gap="300" wrap>
                  {garmentImages.map((url) => (
                    <Box key={url} padding="200" borderWidth="025" borderColor="border" borderRadius="200">
                      <BlockStack gap="150" inlineAlign="center">
                        <RadioButton
                          name="garmentImage"
                          label="Use this image as the garment"
                          labelHidden
                          checked={garmentImageUrl === url}
                          onChange={() => setGarmentImageUrl(url)}
                        />
                        <Thumbnail source={url} alt={product?.title ?? ''} size="large" />
                      </BlockStack>
                    </Box>
                  ))}
                </InlineStack>
              )}
            </BlockStack>
          </Card>
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
