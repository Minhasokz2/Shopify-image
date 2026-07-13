import { useMemo, useRef, useState } from 'react';
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
  Popover,
  ActionList,
} from '@shopify/polaris';
import { MagicIcon, EditIcon, AttachmentIcon, ImagesIcon, XSmallIcon } from '@shopify/polaris-icons';
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

// Custom-prompt scene generation: merchant picks a model, then attaches reference images — from
// their catalog, freshly uploaded, or a mix of both — via a single compact "+" attach control
// next to the prompt input, and writes their own prompt. Reachable two ways: from GenerateMethod
// with selectedProducts already chosen (location.state is set), or directly from the Dashboard's
// "Upload & generate" quick-generate tab with no product at all (location.state is undefined) —
// every image comes from the upload option in that case.
//
// Model comes first, image attachment second (the reverse of the old step order) precisely so
// the attach control already knows the current model's image-count limits (verified live against
// every registered fal.ai endpoint — see fal.js's getImageCountConstraint). Most models genuinely
// require at least one image; a handful of genuine text-to-image models (ideogram-v4-text,
// imagen4-preview, flux-schnell, recraft-v3-text) need none at all and hide the attach control
// entirely rather than showing it as merely optional, since attaching an image to one of these
// would be silently ignored by the underlying fal.ai endpoint.
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
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [catalogPickerOpen, setCatalogPickerOpen] = useState(false);
  const fileInputRef = useRef(null);

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
  // Cap is the currently-picked model's max, or the shared hard limit before a model is chosen.
  const effectiveMax = selectedModel ? imageCount.max : MAX_IMAGES;
  const remainingSlots = Math.max(0, effectiveMax - totalSelectedImages);
  const tooFewForModel = Boolean(selectedModel) && totalSelectedImages < imageCount.min;
  const tooManyForModel = Boolean(selectedModel) && totalSelectedImages > imageCount.max;
  const noImageNeeded = Boolean(selectedModel) && imageCount.max === 0;

  // Switching to a text-to-image model makes any already-attached images irrelevant (they'd
  // never be sent) — clear them rather than leave stale, unused thumbnails on screen.
  const handleModelChange = (modelId) => {
    setSelectedModelId(modelId);
    const nextModel = models.find((m) => m.id === modelId);
    if (nextModel?.imageCount?.max === 0) {
      setSelectedImageUrls(new Set());
      setUploadedImages([]);
    }
  };

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

  // Triggered by the hidden <input type="file"> the "Upload photos" menu action clicks — the
  // native file picker hands back every selected file at once, even beyond however many slots
  // are actually left; extras past the model's (or the shared) cap are silently dropped with an
  // explanation rather than uploaded and then immediately unusable.
  const handleFilesChosen = async (event) => {
    const chosenFiles = Array.from(event.target.files ?? []);
    event.target.value = ''; // allow choosing the exact same file again later
    setUploadError(null);
    const files = chosenFiles.slice(0, remainingSlots);
    if (chosenFiles.length > files.length) {
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
        // Omitted entirely (not sent as []) for text-to-image models — the server schema treats
        // imageUrls as optional, but only when the KEY itself is absent; an explicit empty array
        // still fails its own min(1) check.
        ...(totalSelectedImages > 0
          ? { imageUrls: [...selectedImageUrls, ...uploadedImages.map((img) => img.url)] }
          : {}),
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
    (totalSelectedImages > 0 || noImageNeeded) &&
    customPrompt.trim().length > 0 &&
    Boolean(selectedModelId) &&
    !tooFewForModel &&
    !tooManyForModel &&
    canAfford;

  const attachedThumbnails = [
    ...Array.from(selectedImageUrls).map((url) => ({ url, source: 'catalog' })),
    ...uploadedImages.map((img) => ({ url: img.url, source: 'upload' })),
  ];

  const removeAttached = ({ url, source }) => {
    if (source === 'catalog') toggleImage(url);
    else removeUploadedImage(url);
  };

  const attachMenuItems = [
    {
      content: 'Upload a photo',
      onAction: () => {
        setAttachMenuOpen(false);
        fileInputRef.current?.click();
      },
    },
    ...(availableImages.length > 0
      ? [
          {
            content: 'Choose from your catalog',
            onAction: () => {
              setAttachMenuOpen(false);
              setCatalogPickerOpen(true);
            },
          },
        ]
      : []),
  ];

  return (
    <Page
      title="Custom prompt"
      subtitle="Pick a model, attach reference images, and write your own prompt"
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
          {uploadError ? (
            <Banner tone="critical" onDismiss={() => setUploadError(null)}>
              {uploadError}
            </Banner>
          ) : null}
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <SectionHeading icon={MagicIcon}>1. Choose a model</SectionHeading>
              {modelsLoading ? (
                <InlineStack align="center">
                  <Spinner accessibilityLabel="Loading models" size="small" />
                </InlineStack>
              ) : models.length === 0 ? (
                <EmptyState heading="No models available" image="">
                  <p>Ask the platform admin to enable at least one model for custom prompts.</p>
                </EmptyState>
              ) : (
                <InlineStack gap="300" wrap blockAlign="center">
                  <Box minWidth="260px">
                    <Select
                      label="Model"
                      labelHidden
                      options={[
                        { label: 'Select a model…', value: '' },
                        ...models.map((m) => ({
                          label: `${m.label} (${m.creditCost} credit${m.creditCost === 1 ? '' : 's'}/image)`,
                          value: m.id,
                        })),
                      ]}
                      value={selectedModelId}
                      onChange={handleModelChange}
                    />
                  </Box>

                  {selectedModel ? (
                    <Box minWidth="220px">
                      <Select
                        label="Number of images"
                        labelHidden
                        options={NUM_IMAGES_OPTIONS.map((n) => ({
                          label: `${n} image${n === 1 ? '' : 's'} — ${n * selectedModel.creditCost} credits`,
                          value: String(n),
                        }))}
                        value={numImages}
                        onChange={setNumImages}
                      />
                    </Box>
                  ) : null}

                  {selectedModel ? (
                    <Badge tone={noImageNeeded ? 'success' : 'info'}>
                      {noImageNeeded
                        ? 'No image needed — text only'
                        : imageCount.exact
                          ? `Needs exactly ${imageCount.exact} image${imageCount.exact === 1 ? '' : 's'}`
                          : `Up to ${imageCount.max} images`}
                    </Badge>
                  ) : null}
                  {selectedModel && !canAfford ? (
                    <Text as="span" tone="critical">
                      Not enough credits ({balance} left, need {totalCost}).
                    </Text>
                  ) : null}
                </InlineStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <SectionHeading icon={EditIcon}>
                {noImageNeeded ? '2. Describe the image you want' : '2. Describe the scene and attach images'}
              </SectionHeading>

              {!noImageNeeded && attachedThumbnails.length > 0 ? (
                <InlineStack gap="200" wrap>
                  {attachedThumbnails.map((img) => (
                    <Box key={img.url} position="relative">
                      <Thumbnail source={img.url} alt="Reference image" size="medium" />
                      <Box position="absolute" insetBlockStart="0" insetInlineEnd="0">
                        <Button
                          size="micro"
                          icon={XSmallIcon}
                          accessibilityLabel="Remove image"
                          onClick={() => removeAttached(img)}
                        />
                      </Box>
                    </Box>
                  ))}
                </InlineStack>
              ) : null}

              <Box borderWidth="025" borderColor="border" borderRadius="300" padding="200" background="bg-surface">
                <InlineStack gap="200" blockAlign="center" wrap={false}>
                  {!noImageNeeded ? (
                    <>
                      <Popover
                        active={attachMenuOpen}
                        onClose={() => setAttachMenuOpen(false)}
                        activator={
                          <Button
                            icon={AttachmentIcon}
                            accessibilityLabel="Attach reference image"
                            disabled={remainingSlots === 0}
                            onClick={() => setAttachMenuOpen((open) => !open)}
                          />
                        }
                      >
                        <ActionList items={attachMenuItems} />
                      </Popover>

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        style={{ display: 'none' }}
                        onChange={handleFilesChosen}
                      />
                    </>
                  ) : null}

                  <Box width="100%">
                    <TextField
                      label="Prompt"
                      labelHidden
                      placeholder="Describe the scene you imagine"
                      value={customPrompt}
                      onChange={setCustomPrompt}
                      autoComplete="off"
                    />
                  </Box>
                </InlineStack>
              </Box>

              {!noImageNeeded && uploadMutation.isPending ? (
                <InlineStack gap="200" blockAlign="center">
                  <Spinner accessibilityLabel="Uploading" size="small" />
                  <Text as="span" tone="subdued" variant="bodySm">
                    Uploading…
                  </Text>
                </InlineStack>
              ) : null}

              {!noImageNeeded && remainingSlots === 0 ? (
                <Text as="p" variant="bodySm" tone="subdued">
                  {selectedModel
                    ? `${selectedModel.label} accepts at most ${imageCount.max} image${imageCount.max === 1 ? '' : 's'} — remove one to add another.`
                    : `You've reached the ${MAX_IMAGES}-image limit — remove one to add another.`}
                </Text>
              ) : null}
              {tooFewForModel ? (
                <Text as="span" tone="critical">
                  {`${selectedModel.label} needs at least ${imageCount.min} image${imageCount.min === 1 ? '' : 's'} — attach ${
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

        {catalogPickerOpen ? (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <SectionHeading icon={ImagesIcon}>From your catalog</SectionHeading>
                  <Button variant="plain" onClick={() => setCatalogPickerOpen(false)}>
                    Done
                  </Button>
                </InlineStack>
                {availableImages.length === 0 ? (
                  <EmptyState heading="No images available" image="">
                    <p>The selected product(s) have no images.</p>
                  </EmptyState>
                ) : (
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
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        ) : null}
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
