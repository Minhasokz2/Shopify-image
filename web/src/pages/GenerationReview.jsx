import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
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
  ProgressBar,
} from '@shopify/polaris';
import { useJobPolling } from '../hooks/useJobPolling.js';
import { apiClient } from '../api/client.js';
import { BeforeAfterSlider } from '../components/BeforeAfterSlider.jsx';

const IN_PROGRESS_STATUSES = new Set(['pending', 'processing']);

export default function GenerationReview() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useJobPolling(jobId);
  const job = data?.job;

  const [approved, setApproved] = useState(() => new Set());
  const [publishError, setPublishError] = useState(null);
  const [publishResult, setPublishResult] = useState(null);

  const isVideo = job?.contentType === 'video';

  const publishMutation = useMutation({
    mutationFn: () => apiClient.post(`/api/jobs/${jobId}/publish`, { productId: job.productId }),
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
      // NOTE: the backend's `variations[].approved` flag defaults to false and is only ever set
      // by the generation pipeline itself — there is currently no PATCH /api/jobs/:jobId endpoint
      // to persist which variations the merchant approved here. This UI implements the full
      // approve/publish flow with local state (as the intended UX), but until that persistence
      // gap is closed server-side, this call will publish whatever the job record already has
      // marked approved (typically nothing), not necessarily the checkboxes toggled below.
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
      return (
        <Card>
          <BlockStack gap="300">
            <InlineStack gap="200" blockAlign="center">
              <Spinner accessibilityLabel="Generating" size="small" />
              <Text as="span">{job.status === 'pending' ? 'Queued…' : 'Generating…'}</Text>
            </InlineStack>
            <ProgressBar progress={job.status === 'pending' ? 10 : 60} tone="primary" />
          </BlockStack>
        </Card>
      );
    }
    return null;
  }, [job]);

  return (
    <Page
      title="Review generation"
      backAction={{ content: 'Dashboard', onAction: () => navigate('/') }}
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
                        <BeforeAfterSlider beforeSrc={job.productImageUrl} afterSrc={variation.url} />
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
