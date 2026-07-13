import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Banner,
  Spinner,
  Checkbox,
  Button,
  Box,
  TextField,
} from '@shopify/polaris';
import { useJobPolling } from '../hooks/useJobPolling.js';
import { apiClient } from '../api/client.js';
import { BeforeAfterSlider } from '../components/BeforeAfterSlider.jsx';
import { CreditBalanceBadge } from '../components/CreditBalanceBadge.jsx';
import { GenerationProgress } from '../components/GenerationProgress.jsx';
import { ProductPickerModal } from '../components/ProductPickerModal.jsx';
import { useCreditBalance } from '../hooks/useCreditBalance.js';
import { downloadFile } from '../utils/download.js';
import { inferFormatFromUrl } from '../utils/imageFormat.js';

const IN_PROGRESS_STATUSES = new Set(['pending', 'processing']);

function variationFilename(jobId, index, isVideo, url) {
  const ext = isVideo ? 'mp4' : inferFormatFromUrl(url) || 'png';
  return `motionart-${jobId}-${index + 1}.${ext}`;
}

export default function GenerationReview() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useJobPolling(jobId);
  const job = data?.job;
  const queryClient = useQueryClient();
  const { data: creditData } = useCreditBalance();

  const [approved, setApproved] = useState(() => new Set());
  const [publishError, setPublishError] = useState(null);
  const [publishResult, setPublishResult] = useState(null);

  const [compressSelected, setCompressSelected] = useState(() => new Set());
  const [compressError, setCompressError] = useState(null);

  // Publishing isn't locked to the product the job was created for — the backend
  // (publishJobToShopify) never required that, it just accepts whatever productId it's given.
  // `targetProduct` is only set once the merchant explicitly picks a different product; until
  // then, publishing falls back to the job's own product (if it has one).
  const [targetProduct, setTargetProduct] = useState(null);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const effectiveProductId = targetProduct?.id ?? job?.productId ?? null;

  // Offered only when the job has no product at all (e.g. generated from an uploaded reference
  // image rather than a catalog item — see CustomPromptStudio.jsx's upload tab). Creates a bare
  // Shopify product and points `targetProduct` at it, so the existing publish flow below (button,
  // approvedIndices, effectiveProductId) handles the rest exactly as if a real product had always
  // been chosen — no separate "attach media to a brand-new product" logic needed here.
  const [newProductTitle, setNewProductTitle] = useState('');
  const [createProductError, setCreateProductError] = useState(null);
  const createProductMutation = useMutation({
    mutationFn: () => apiClient.post(`/api/jobs/${jobId}/create-product`, { title: newProductTitle.trim() }),
  });

  const isVideo = job?.contentType === 'video';

  // The job worker only deducts credits once generation succeeds (see
  // creditLedger.settleJobSuccess) — the cached balance shown elsewhere in the app is stale
  // until this fires, so refresh it the moment this job's status flips to succeeded.
  useEffect(() => {
    if (job?.status === 'succeeded') {
      queryClient.invalidateQueries({ queryKey: ['credits'] });
    }
  }, [job?.status, queryClient]);

  const publishMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`/api/jobs/${jobId}/publish`, {
        productId: effectiveProductId,
        approvedIndices: Array.from(approved),
      }),
  });

  const toggleApproved = (index) => {
    setApproved((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handlePublish = async () => {
    setPublishError(null);
    setPublishResult(null);
    try {
      const result = await publishMutation.mutateAsync();
      setPublishResult(result);
      // The job's status is already terminal (`succeeded`) by the time publishing happens, so
      // useJobPolling's refetchInterval has stopped polling — without this, the "Published"
      // badge and approve checkboxes below would keep showing stale pre-publish state.
      queryClient.invalidateQueries({ queryKey: ['job', jobId] });
    } catch (err) {
      setPublishError(err.message || 'Failed to publish approved variations.');
    }
  };

  const handleCreateProduct = async () => {
    setCreateProductError(null);
    try {
      const result = await createProductMutation.mutateAsync();
      setTargetProduct({ id: result.productId, title: result.productTitle ?? newProductTitle.trim() });
    } catch (err) {
      setCreateProductError(err.message || 'Failed to create product.');
    }
  };

  const toggleCompress = (index) => {
    setCompressSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // Reuses the exact same Compress Image pipeline (quota check, WebP conversion, batch progress
  // page) as the dedicated feature — a generated result is just another sourceUrl to it, no
  // special-casing needed. Not tied to any product/media, so replaceInPlace never applies here.
  const compressMutation = useMutation({
    mutationFn: () =>
      apiClient.post('/api/image-optimizer/convert', {
        idempotencyKey: crypto.randomUUID(),
        images: Array.from(compressSelected).map((index) => {
          const url = job.variations[index].url;
          return { sourceUrl: url, inputFormat: inferFormatFromUrl(url) || 'png', isAnimatedGif: false };
        }),
        outputFormats: ['webp'],
      }),
  });

  const handleCompress = async () => {
    setCompressError(null);
    try {
      const result = await compressMutation.mutateAsync();
      navigate(`/image-optimizer/batches/${result.batchId}`);
    } catch (err) {
      if (err.statusCode === 402) {
        setCompressError('Daily free conversion limit reached. Upgrade Compress Image to unlimited from Settings & Plans.');
      } else {
        setCompressError(err.message || 'Failed to start compression.');
      }
    }
  };

  const approvedCount = approved.size;

  const statusBanner = useMemo(() => {
    if (!job) return null;
    if (job.status === 'failed') {
      return (
        <Banner tone="critical" title="Generation failed">
          <p>{job.errorMessage || 'Something went wrong while generating this content.'}</p>
        </Banner>
      );
    }
    if (IN_PROGRESS_STATUSES.has(job.status)) {
      return <GenerationProgress job={job} />;
    }
    return null;
  }, [job]);

  return (
    <Page
      title="Review generation"
      backAction={{ content: 'Job History', onAction: () => navigate('/history') }}
      titleMetadata={<CreditBalanceBadge />}
    >
      <BlockStack gap="400">
        {error ? (
          <Banner tone="critical" title="Couldn't load this job">
            <p>{error.message}</p>
          </Banner>
        ) : null}

        {isLoading && !job ? (
          <Box padding="400">
            <InlineStack align="center">
              <Spinner accessibilityLabel="Loading job" size="small" />
            </InlineStack>
          </Box>
        ) : null}

        {statusBanner}

        {publishError ? (
          <Banner tone="critical" title="Couldn't publish" onDismiss={() => setPublishError(null)}>
            <p>{publishError}</p>
          </Banner>
        ) : null}

        {publishResult ? (
          <Banner
            tone={publishResult.alreadyPublished ? 'info' : 'success'}
            title={publishResult.alreadyPublished ? 'Already published' : 'Published to Shopify'}
            onDismiss={() => setPublishResult(null)}
          />
        ) : null}

        {compressError ? (
          <Banner tone="critical" title="Couldn't start compression" onDismiss={() => setCompressError(null)}>
            <p>{compressError}</p>
          </Banner>
        ) : null}

        {job && job.status === 'succeeded' ? (
          <>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  {isVideo ? 'Generated video' : `${job.variations.length} variations`}
                </Text>
                <Text as="span" tone="subdued">
                  {job.creditsCharged} credits charged
                  {creditData ? ` — ${creditData.creditBalance} credits remaining` : ''}
                </Text>
              </BlockStack>
            </Card>

            <InlineStack gap="300" wrap>
              {job.variations.map((variation, index) => (
                <Box key={index} minWidth="280px" maxWidth="360px">
                  <Card>
                    <BlockStack gap="300">
                      {isVideo ? (
                        // eslint-disable-next-line jsx-a11y/media-has-caption
                        <video controls style={{ width: '100%', borderRadius: 8 }} src={variation.url} />
                      ) : (
                        <BeforeAfterSlider
                          beforeSrc={job.productImageUrl ?? job.productImageUrls?.[0]}
                          afterSrc={variation.url}
                        />
                      )}
                      <InlineStack align="space-between" blockAlign="center">
                        <Checkbox
                          label="Approve"
                          checked={approved.has(index)}
                          onChange={() => toggleApproved(index)}
                        />
                        {variation.publishedToShopify ? (
                          <Text as="span" variant="bodySm" tone="success">
                            Published
                          </Text>
                        ) : null}
                      </InlineStack>

                      {!isVideo ? (
                        <Checkbox
                          label="Select to compress (WebP)"
                          checked={compressSelected.has(index)}
                          onChange={() => toggleCompress(index)}
                        />
                      ) : null}

                      <Button
                        onClick={() => downloadFile(variation.url, variationFilename(jobId, index, isVideo, variation.url))}
                      >
                        Download
                      </Button>
                    </BlockStack>
                  </Card>
                </Box>
              ))}
            </InlineStack>

            {!isVideo ? (
              <InlineStack align="end">
                <Button
                  disabled={compressSelected.size === 0}
                  loading={compressMutation.isPending}
                  onClick={handleCompress}
                >
                  {`Compress selected to WebP (${compressSelected.size})`}
                </Button>
              </InlineStack>
            ) : null}

            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center" wrap>
                  <BlockStack gap="050">
                    <Text as="span" variant="bodySm" tone="subdued">
                      Publish to
                    </Text>
                    <Text as="span" fontWeight="medium">
                      {targetProduct
                        ? targetProduct.title
                        : job.productId
                          ? 'The product this was generated from'
                          : 'No product chosen yet'}
                    </Text>
                  </BlockStack>
                  <Button onClick={() => setProductPickerOpen(true)}>
                    {targetProduct || job.productId ? 'Use a different product' : 'Choose a product'}
                  </Button>
                </InlineStack>

                {!targetProduct && !job.productId ? (
                  <BlockStack gap="200">
                    <Text as="p" variant="bodySm" tone="subdued">
                      Or create a brand-new product from this image
                    </Text>
                    {createProductError ? (
                      <Banner tone="critical" onDismiss={() => setCreateProductError(null)}>
                        {createProductError}
                      </Banner>
                    ) : null}
                    <InlineStack gap="200" blockAlign="center" wrap>
                      <Box minWidth="240px">
                        <TextField
                          label="New product title"
                          labelHidden
                          placeholder="e.g. Studio Scene Mug"
                          value={newProductTitle}
                          onChange={setNewProductTitle}
                          autoComplete="off"
                        />
                      </Box>
                      <Button
                        loading={createProductMutation.isPending}
                        disabled={!newProductTitle.trim()}
                        onClick={handleCreateProduct}
                      >
                        Create a new product
                      </Button>
                    </InlineStack>
                  </BlockStack>
                ) : null}
              </BlockStack>
            </Card>

            <InlineStack align="end">
              <Button
                variant="primary"
                disabled={approvedCount === 0 || !effectiveProductId}
                loading={publishMutation.isPending}
                onClick={handlePublish}
              >
                {`Publish approved (${approvedCount})`}
              </Button>
            </InlineStack>
          </>
        ) : null}
      </BlockStack>

      {productPickerOpen ? (
        <ProductPickerModal
          title="Choose a product to publish to"
          onClose={() => setProductPickerOpen(false)}
          onSelect={(product) => {
            setTargetProduct(product);
            setProductPickerOpen(false);
          }}
        />
      ) : null}
    </Page>
  );
}
