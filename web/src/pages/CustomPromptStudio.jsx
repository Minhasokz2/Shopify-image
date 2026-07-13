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
  DropZone,
} from '@shopify/polaris';
import { ImagesIcon, EditIcon, MagicIcon } from '@shopify/polaris-icons';
import { apiClient } from '../api/client.js';
import { CreditBalanceBadge } from '../components/CreditBalanceBadge.jsx';
import { useCreditBalance } from '../hooks/useCreditBalance.js';
import { StickyActionBar } from '../components/StickyActionBar.jsx';
import { SectionHeading } from '../components/SectionHeading.jsx';

const MAX_IMAGES = 6;
const NUM_IMAGES_OPTIONS = [1, 2, 3, 4];
const DEFAULT_IMAGE_COUNT = { min: 1, max: MAX_IMAGES, exact: null };

// Allowed Models is admin-managed from a separate app — don't trust the global 10s staleTime
// (main.jsx) for whether a model is priced/active right now (see TemplateGallery.jsx for the
// same reasoning applied to the template catalog).
function useAllowedModels() {
  return useQuery({
    queryKey: ['models', 'scene'],
    queryFn: () => apiClient.get('/api/models?category=scene'),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
  });
}

// Custom-prompt scene generation: merchant selects reference images — from their catalog, freshly
// uploaded, or a mix of both — writes their own prompt, and picks an admin-allowed model directly.
// Reachable two ways: from GenerateMethod with selectedProducts already chosen (location.state is
// set), or directly from the Dashboard's "Upload & generate" quick-generate tab with no product at
// all (location.state is undefined) — every image comes from the upload widget in that case. Both
// paths render the exact same page; only the catalog checkboxes section is skipped when there are
// no product images to offer.
export default function CustomPromptStudio() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedProducts = location.state?.selectedProducts ?? [];
  const cameFromGenerateMethod = Boolean(location.state);

  const [selectedImageUrls, setSelectedImageUrls] = useState(() => new Set());
  const [uploadedImages, setUploadedImages] = useState([]); // [{ url }], newest last
  const [uploadError, setUploadError] = useState(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedModelId, setSelectedModelId] = useState('');
  const [numImages, setNumImages] = useState('1');
  const [generateError, setGenerateError] = useState(null);

  const { data: modelsData, isLoading: modelsLoading, error: modelsError } = useAllowedModels();
  const { data: creditData } = useCreditBalance();
  // fashn-tryon (Virtual Try-On) is deliberately excluded here — it needs two DIFFERENT image
  // roles (a person photo and a separate garment photo), not a list of interchangeable
  // references this page's UI offers, which is exactly why it gets its own guided flow
  // (VirtualTryOn.jsx) instead. Selecting it here would let a merchant pick e.g. 1 or 4 images
  // and only fail with a confusing error once generation actually runs.
  const models = (modelsData?.models ?? []).filter((m) => m.id !== 'fashn-tryon');
  const selectedModel = models.find((m) => m.id === selectedModelId) ?? null;
  const imageCount = selectedModel?.imageCount ?? DEFAULT_IMAGE_COUNT;

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

  const totalSelectedImages = selectedImageUrls.size + uploadedImages.length;
  // Cap is the currently-picked model's max once one is chosen, otherwise the shared hard limit —
  // model choice happens in step 3, after images are picked in step 1, so before a model is
  // selected the widest possible cap applies and gets enforced retroactively once one is.
  const effectiveMax = selectedModel ? imageCount.max : MAX_IMAGES;
  const remainingSlots = Math.max(0, effectiveMax - totalSelectedImages);
  const tooFewForModel = Boolean(selectedModel) && totalSelectedImages < imageCount.min;
  const tooManyForModel = Boolean(selectedModel) && totalSelectedImages > imageCount.max;

  const toggleImage = (url) => {
    setSelectedImageUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) {
        next.delete(url);
      } else if (remainingSlots > 0) {
        next.add(url);
      }
      return next;
    });
  };

  const uploadFile = (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.postFormData('/api/uploads/reference-image', formData);
  };
  const uploadMutation = useMutation({ mutationFn: uploadFile });

  // DropZone hands back every dropped/selected file at once, even beyond however many slots are
  // actually left — extra files past the model's (or the shared) cap are silently dropped with an
  // explanation rather than uploaded and then immediately unusable.
  const handleDropUpload = async (_dropFiles, acceptedFiles) => {
    setUploadError(null);
    const files = acceptedFiles.slice(0, remainingSlots);
    if (acceptedFiles.length > files.length) {
      setUploadError(
        `Only ${remainingSlots} more image${remainingSlots === 1 ? '' : 's'} can be added${
          selectedModel ? ` for ${selectedModel.label}` : ''
        } — the rest weren't uploaded.`,
      );
    }
    for (const file of files) {
      try {
        const result = await uploadMutation.mutateAsync(file);
        setUploadedImages((prev) => [...prev, { url: result.imageUrl }]);
      } catch (err) {
        setUploadError(err.message);
        break;
      }
    }
  };

  const removeUploadedImage = (url) => {
    setUploadedImages((prev) => prev.filter((img) => img.url !== url));
  };

  const generateMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/api/generate', {
        productId: selectedProducts[0]?.id,
        contentType: 'scene',
        modelId: selectedModelId,
        customPrompt: customPrompt.trim(),
        imageUrls: [...selectedImageUrls, ...uploadedImages.map((img) => img.url)],
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
    totalSelectedImages > 0 &&
    customPrompt.trim().length > 0 &&
    Boolean(selectedModelId) &&
    !tooFewForModel &&
    !tooManyForModel &&
    canAfford;

  return (
    <Page
      title="Custom prompt"
      subtitle="Select or upload reference images, write your own prompt, and pick a model"
      backAction={{
        content: cameFromGenerateMethod ? 'Back' : 'Dashboard',
        onAction: () =>
          cameFromGenerateMethod ? navigate('/generate-method', { state: { selectedProducts } }) : navigate('/'),
      }}
      titleMetadata={<CreditBalanceBadge />}
    >
      <Layout>
        <Layout.Section>
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
              <SectionHeading icon={ImagesIcon}>
                {`1. Select reference images (${totalSelectedImages}/${effectiveMax})`}
              </SectionHeading>

              {availableImages.length > 0 ? (
                <BlockStack gap="200">
                  <Text as="p" variant="bodySm" tone="subdued">
                    From your catalog
                  </Text>
                  <InlineStack gap="300" wrap>
                    {availableImages.map(({ url, productTitle }) => {
                      const isSelected = selectedImageUrls.has(url);
                      return (
                        <Box
                          key={url}
                          padding="200"
                          borderWidth={isSelected ? '050' : '025'}
                          borderColor={isSelected ? 'border-emphasis' : 'border'}
                          borderRadius="200"
                          background={isSelected ? 'bg-surface-selected' : undefined}
                        >
                          <BlockStack gap="150" inlineAlign="center">
                            <Checkbox
                              label={`Select image from ${productTitle}`}
                              labelHidden
                              checked={isSelected}
                              disabled={!isSelected && remainingSlots === 0}
                              onChange={() => toggleImage(url)}
                            />
                            <Thumbnail source={url} alt={productTitle} size="large" />
                            <Text as="span" variant="bodySm" tone="subdued">
                              {productTitle}
                            </Text>
                          </BlockStack>
                        </Box>
                      );
                    })}
                  </InlineStack>
                </BlockStack>
              ) : selectedProducts.length > 0 ? (
                <EmptyState heading="No images available" image="">
                  <p>The selected product(s) have no images.</p>
                </EmptyState>
              ) : null}

              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  Or upload your own
                </Text>

                {uploadedImages.length > 0 ? (
                  <InlineStack gap="300" wrap>
                    {uploadedImages.map((img) => (
                      <Box key={img.url} padding="200" borderWidth="025" borderColor="border" borderRadius="200">
                        <BlockStack gap="150" inlineAlign="center">
                          <Thumbnail source={img.url} alt="Uploaded reference image" size="large" />
                          <Button variant="plain" tone="critical" onClick={() => removeUploadedImage(img.url)}>
                            Remove
                          </Button>
                        </BlockStack>
                      </Box>
                    ))}
                  </InlineStack>
                ) : null}

                {remainingSlots > 0 ? (
                  <DropZone accept="image/*" type="image" allowMultiple onDrop={handleDropUpload}>
                    <DropZone.FileUpload
                      actionTitle="Drag or upload image(s)"
                      actionHint={`Supports JPG, JPEG, PNG, WEBP, up to 20MB each — ${remainingSlots} more can be added${
                        selectedModel ? ` for ${selectedModel.label}` : ''
                      }`}
                    />
                  </DropZone>
                ) : (
                  <Text as="p" variant="bodySm" tone="subdued">
                    {selectedModel
                      ? `${selectedModel.label} accepts at most ${imageCount.max} image${imageCount.max === 1 ? '' : 's'} — remove one to add another.`
                      : `You've reached the ${MAX_IMAGES}-image limit — remove one to add another.`}
                  </Text>
                )}

                {uploadMutation.isPending ? (
                  <InlineStack align="center">
                    <Spinner accessibilityLabel="Uploading" size="small" />
                  </InlineStack>
                ) : null}

                {uploadError ? (
                  <Banner tone="critical" onDismiss={() => setUploadError(null)}>
                    {uploadError}
                  </Banner>
                ) : null}
              </BlockStack>

              {tooFewForModel ? (
                <Text as="span" tone="critical">
                  {`${selectedModel.label} needs at least ${imageCount.min} image${imageCount.min === 1 ? '' : 's'} — select or upload ${
                    imageCount.min - totalSelectedImages
                  } more.`}
                </Text>
              ) : null}
              {tooManyForModel ? (
                <Text as="span" tone="critical">
                  {`${selectedModel.label} only accepts ${imageCount.exact ?? imageCount.max} image${
                    (imageCount.exact ?? imageCount.max) === 1 ? '' : 's'
                  } — remove ${totalSelectedImages - imageCount.max} to continue.`}
                </Text>
              ) : null}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <SectionHeading icon={EditIcon}>2. Write your prompt</SectionHeading>
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
              <SectionHeading icon={MagicIcon}>3. Choose a model and how many images</SectionHeading>
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
                      <Badge tone="info">
                        {imageCount.exact
                          ? `Needs exactly ${imageCount.exact} image${imageCount.exact === 1 ? '' : 's'}`
                          : `Up to ${imageCount.max} images`}
                      </Badge>
                    </InlineStack>
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
