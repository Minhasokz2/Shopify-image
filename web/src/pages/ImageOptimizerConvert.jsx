import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Tabs,
  Checkbox,
  ChoiceList,
  RangeSlider,
  Thumbnail,
  Box,
  Banner,
  Button,
  DropZone,
  Spinner,
  EmptyState,
} from '@shopify/polaris';
import { apiClient } from '../api/client.js';
import { useImageOptimizerImages, useImageOptimizerUsage } from '../hooks/useImageOptimizer.js';
import { StickyActionBar } from '../components/StickyActionBar.jsx';

const TABS = [
  { id: 'store', content: 'Store Images' },
  { id: 'upload', content: 'Upload' },
];

function inferFormatFromUrl(url) {
  try {
    const clean = url.split('?')[0];
    const ext = clean.split('.').pop().toLowerCase();
    return ext === 'jpeg' ? 'jpg' : ext;
  } catch {
    return '';
  }
}

// Merchant selects one or more product images (from the store catalog) and/or uploads fresh
// files, picks output format(s) and quality, then converts — mirrors ProductPicker's
// selection-grid pattern but for images directly rather than whole products, since a single
// product can have several images a merchant might want to convert independently.
export default function ImageOptimizerConvert() {
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState(0);
  const [selectedImages, setSelectedImages] = useState(() => new Map());
  const [outputFormats, setOutputFormats] = useState(['webp']);
  const [quality, setQuality] = useState(80);
  const [replaceInPlace, setReplaceInPlace] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  const { data: usage } = useImageOptimizerUsage();
  const { data: imagesData, isLoading: imagesLoading, error: imagesError } = useImageOptimizerImages();
  const products = imagesData?.products ?? [];

  const toggleStoreImage = (product, image) => {
    const key = image.mediaId;
    setSelectedImages((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        const inputFormat = inferFormatFromUrl(image.url);
        next.set(key, {
          key,
          url: image.url,
          productId: product.id,
          mediaId: image.mediaId,
          inputFormat,
          isAnimatedGif: inputFormat === 'gif',
          source: 'store',
        });
      }
      return next;
    });
  };

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiClient.postFormData('/api/image-optimizer/upload', formData);
    },
  });

  const handleDrop = async (_dropFiles, acceptedFiles) => {
    setUploadError(null);
    for (const file of acceptedFiles) {
      try {
        const result = await uploadMutation.mutateAsync(file);
        setSelectedImages((prev) => {
          const next = new Map(prev);
          next.set(result.sourceUrl, {
            key: result.sourceUrl,
            url: result.sourceUrl,
            inputFormat: result.inputFormat,
            isAnimatedGif: result.isAnimatedGif,
            source: 'upload',
          });
          return next;
        });
      } catch (err) {
        setUploadError(err.message);
      }
    }
  };

  const removeSelected = (key) => {
    setSelectedImages((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  };

  const selectedList = Array.from(selectedImages.values());
  const hasSvg = selectedList.some((img) => img.inputFormat === 'svg');
  const hasGif = selectedList.some((img) => img.isAnimatedGif);
  // Replace-in-place needs a product + Shopify media id to target — only images picked from the
  // Store Images tab carry those; a freshly uploaded file has nowhere in Shopify to replace yet.
  const canReplaceInPlace = selectedList.length > 0 && selectedList.every((img) => img.source === 'store');

  const remaining = usage?.unlimited ? null : (usage?.remaining ?? null);
  const overQuota = !usage?.unlimited && remaining !== null && selectedList.length > remaining;

  const convertMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/api/image-optimizer/convert', {
        idempotencyKey: crypto.randomUUID(),
        images: selectedList.map((img) => ({
          sourceUrl: img.url,
          inputFormat: img.inputFormat,
          productId: img.productId,
          mediaId: img.mediaId,
          isAnimatedGif: img.isAnimatedGif,
        })),
        outputFormats,
        quality,
        replaceInPlace: replaceInPlace && canReplaceInPlace,
      }),
  });

  const handleSubmit = async () => {
    setSubmitError(null);
    try {
      const result = await convertMutation.mutateAsync();
      navigate(`/image-optimizer/batches/${result.batchId}`);
    } catch (err) {
      setSubmitError(err.message);
    }
  };

  const canSubmit = selectedList.length > 0 && outputFormats.length > 0 && !overQuota;

  return (
    <Page
      title="Convert Images"
      subtitle="Convert product images to WebP or AVIF, one at a time or in bulk"
      secondaryActions={[
        { content: 'Conversion History', onAction: () => navigate('/image-optimizer/history') },
        { content: 'Settings & Plans', onAction: () => navigate('/image-optimizer/settings') },
      ]}
    >
      <Layout>
        <Layout.Section>
          {usage ? (
            <Banner tone={usage.unlimited ? 'success' : overQuota ? 'warning' : 'info'}>
              {usage.unlimited
                ? 'Unlimited conversions — Compress Image add-on active.'
                : `${usage.remaining} of ${usage.dailyLimit} free conversions left today.`}
            </Banner>
          ) : null}
          {imagesError ? (
            <Banner tone="critical" title="Couldn't load store images">
              <p>{imagesError.message}</p>
            </Banner>
          ) : null}
          {uploadError ? (
            <Banner tone="critical" title="Upload failed" onDismiss={() => setUploadError(null)}>
              <p>{uploadError}</p>
            </Banner>
          ) : null}
          {submitError ? (
            <Banner tone="critical" title="Couldn't start conversion" onDismiss={() => setSubmitError(null)}>
              <p>{submitError}</p>
            </Banner>
          ) : null}
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Tabs tabs={TABS} selected={selectedTab} onSelect={setSelectedTab} />
            <Box paddingBlockStart="400">
              {selectedTab === 0 ? (
                imagesLoading ? (
                  <InlineStack align="center">
                    <Spinner accessibilityLabel="Loading store images" size="small" />
                  </InlineStack>
                ) : products.length === 0 ? (
                  <EmptyState heading="No product images found" image="">
                    <p>Add images to your products, then come back here to convert them.</p>
                  </EmptyState>
                ) : (
                  <BlockStack gap="400">
                    {products.map((product) => (
                      <BlockStack gap="200" key={product.id}>
                        <Text as="h3" variant="headingSm">
                          {product.title}
                        </Text>
                        <InlineStack gap="300" wrap>
                          {product.images.map((image) => (
                            <Box key={image.mediaId} padding="150" borderWidth="025" borderColor="border" borderRadius="200">
                              <BlockStack gap="100" inlineAlign="center">
                                <Checkbox
                                  label={`Select image from ${product.title}`}
                                  labelHidden
                                  checked={selectedImages.has(image.mediaId)}
                                  onChange={() => toggleStoreImage(product, image)}
                                />
                                <Thumbnail source={image.url} alt={product.title} size="small" />
                              </BlockStack>
                            </Box>
                          ))}
                        </InlineStack>
                      </BlockStack>
                    ))}
                  </BlockStack>
                )
              ) : (
                <DropZone accept="image/*" type="image" onDrop={handleDrop}>
                  <DropZone.FileUpload />
                </DropZone>
              )}
            </Box>
          </Card>
        </Layout.Section>

        {selectedList.length > 0 ? (
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  {selectedList.length} image{selectedList.length === 1 ? '' : 's'} selected
                </Text>
                <InlineStack gap="200" wrap>
                  {selectedList.map((img) => (
                    <Box key={img.key} padding="100" borderWidth="025" borderColor="border" borderRadius="200">
                      <BlockStack gap="050" inlineAlign="center">
                        <Thumbnail source={img.url} alt="" size="small" />
                        <Button variant="plain" tone="critical" onClick={() => removeSelected(img.key)}>
                          Remove
                        </Button>
                      </BlockStack>
                    </Box>
                  ))}
                </InlineStack>
                {hasSvg ? (
                  <Text as="p" tone="subdued" variant="bodySm">
                    SVG images will be rasterized at 2x resolution.
                  </Text>
                ) : null}
                {hasGif ? (
                  <Text as="p" tone="subdued" variant="bodySm">
                    Animated GIFs stay animated only when converted to WebP — AVIF output keeps just the first frame.
                  </Text>
                ) : null}
              </BlockStack>
            </Card>
          </Layout.Section>
        ) : null}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Options
              </Text>
              <ChoiceList
                title="Output format"
                allowMultiple
                choices={[
                  { label: 'WebP', value: 'webp' },
                  { label: 'AVIF', value: 'avif' },
                ]}
                selected={outputFormats}
                onChange={setOutputFormats}
              />
              <RangeSlider label={`Quality: ${quality}`} min={1} max={100} value={quality} onChange={setQuality} output />
              <Checkbox
                label="Replace image in place on the product"
                helpText={
                  canReplaceInPlace
                    ? 'Removes the original image from the product once the converted version is live. The original stays backed up for 30 days and can be restored from Conversion History.'
                    : 'Only available for images selected from Store Images.'
                }
                checked={replaceInPlace}
                disabled={!canReplaceInPlace}
                onChange={setReplaceInPlace}
              />
            </BlockStack>
          </Card>
        </Layout.Section>

      </Layout>

      <StickyActionBar edge="bottom">
        <BlockStack gap="200">
          {overQuota ? (
            <Banner tone="warning" title="Not enough free conversions left today">
              <p>
                You have {remaining} free conversion{remaining === 1 ? '' : 's'} left today but selected {selectedList.length}.
                Deselect some images, or upgrade to unlimited for $2.99/mo.
              </p>
              <Button onClick={() => navigate('/image-optimizer/settings')}>View plans</Button>
            </Banner>
          ) : null}
          <InlineStack align="end">
            <Button
              variant="primary"
              size="large"
              disabled={!canSubmit}
              loading={convertMutation.isPending}
              onClick={handleSubmit}
            >
              {`Convert${selectedList.length > 0 ? ` (${selectedList.length})` : ''}`}
            </Button>
          </InlineStack>
        </BlockStack>
      </StickyActionBar>
    </Page>
  );
}
