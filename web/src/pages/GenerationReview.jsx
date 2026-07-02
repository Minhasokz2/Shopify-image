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
} from '@shopify/polaris';
import { useJobPolling } from '../hooks/useJobPolling.js';
import { apiClient } from '../api/client.js';
import { BeforeAfterSlider } from '../components/BeforeAfterSlider.jsx';
import { CreditBalanceBadge } from '../components/CreditBalanceBadge.jsx';
import { GenerationProgress } from '../components/GenerationProgress.jsx';
import { useCreditBalance } from '../hooks/useCreditBalance.js';

const IN_PROGRESS_STATUSES = new Set(['pending', 'processing']);

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
        productId: job.productId,
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
    } catch (err) {
      setPublishError(err.message || 'Failed to publish approved variations.');
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
      backAction={{ content: 'Dashboard', onAction: () => navigate('/') }}
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
                    </BlockStack>
                  </Card>
                </Box>
              ))}
            </InlineStack>

            <InlineStack align="end">
              <Button
                variant="primary"
                disabled={approvedCount === 0}
                loading={publishMutation.isPending}
                onClick={handlePublish}
              >
                {`Publish approved (${approvedCount})`}
              </Button>
            </InlineStack>
          </>
        ) : null}
      </BlockStack>
    </Page>
  );
}
