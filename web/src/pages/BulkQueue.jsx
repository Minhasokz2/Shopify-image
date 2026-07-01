import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  BlockStack,
  Banner,
  Button,
  Card,
  EmptyState,
  InlineStack,
  Layout,
  Page,
  ProgressBar,
  Spinner,
  Text,
} from '@shopify/polaris';
import { useBatchPolling } from '../hooks/useJobPolling.js';
import { apiClient } from '../api/client.js';
import { JobProgressCard } from '../components/JobProgressCard.jsx';

export default function BulkQueue() {
  const { batchId } = useParams();
  const navigate = useNavigate();

  if (!batchId) {
    return (
      <Page title="Bulk Queue">
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="No batch selected"
                action={{ content: 'Go to Product Picker', onAction: () => navigate('/products') }}
                image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
              >
                <p>
                  Bulk generation starts from the Product Picker — select the products you want to generate content
                  for there, then come back here to track progress.
                </p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return <BatchTracker batchId={batchId} />;
}

function BatchTracker({ batchId }) {
  const { data, isLoading } = useBatchPolling(batchId);
  const [selectedJobIds, setSelectedJobIds] = useState(() => new Set());
  const [publishState, setPublishState] = useState({ status: 'idle', error: null });

  const batch = data?.batch;
  const jobs = data?.jobs ?? [];
  const succeededJobs = useMemo(() => jobs.filter((job) => job.status === 'succeeded'), [jobs]);
  const publishableJobs = useMemo(
    () => succeededJobs.filter((job) => !job.variations?.[0]?.publishedToShopify),
    [succeededJobs],
  );

  const handleSelectChange = (jobId, checked) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(jobId);
      else next.delete(jobId);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedJobIds(new Set(publishableJobs.map((job) => job.id)));
  };

  const handleClearSelection = () => setSelectedJobIds(new Set());

  const handlePublish = async () => {
    setPublishState({ status: 'loading', error: null });
    try {
      const productIdsByJobId = {};
      for (const job of jobs) {
        if (selectedJobIds.has(job.id)) {
          productIdsByJobId[job.id] = job.productId;
        }
      }
      await apiClient.post(`/api/batches/${batchId}/publish`, { productIdsByJobId });
      setPublishState({ status: 'success', error: null });
      setSelectedJobIds(new Set());
    } catch (error) {
      setPublishState({ status: 'error', error: error.message });
    }
  };

  if (isLoading && !batch) {
    return (
      <Page title="Bulk Queue">
        <Layout>
          <Layout.Section>
            <Card>
              <InlineStack gap="200" blockAlign="center">
                <Spinner size="small" />
                <Text as="span">Loading batch…</Text>
              </InlineStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  if (!batch) {
    return (
      <Page title="Bulk Queue">
        <Layout>
          <Layout.Section>
            <Banner tone="critical">Batch not found.</Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const progress = batch.totalCount > 0 ? Math.round((batch.completedCount / batch.totalCount) * 100) : 0;

  return (
    <Page title="Bulk Queue" subtitle={`Batch ${batch.id}`}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">
                  {batch.status === 'processing'
                    ? 'Generating…'
                    : batch.status === 'complete'
                      ? 'Batch complete'
                      : 'Batch finished with some failures'}
                </Text>
                <Text as="span" tone="subdued">
                  {batch.completedCount}/{batch.totalCount} done
                  {batch.failedCount > 0 ? ` · ${batch.failedCount} failed` : ''}
                </Text>
              </InlineStack>
              <ProgressBar progress={progress} size="small" />
            </BlockStack>
          </Card>
        </Layout.Section>

        {publishState.status === 'success' && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => setPublishState({ status: 'idle', error: null })}>
              Selected jobs were published to Shopify.
            </Banner>
          </Layout.Section>
        )}
        {publishState.status === 'error' && (
          <Layout.Section>
            <Banner tone="critical" onDismiss={() => setPublishState({ status: 'idle', error: null })}>
              {publishState.error}
            </Banner>
          </Layout.Section>
        )}

        {publishableJobs.length > 0 && (
          <Layout.Section>
            <Card>
              <BlockStack gap="200">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h3" variant="headingSm">
                    Approve &amp; publish
                  </Text>
                  <ButtonGroupInline
                    onSelectAll={handleSelectAll}
                    onClear={handleClearSelection}
                    onPublish={handlePublish}
                    disabled={selectedJobIds.size === 0}
                    loading={publishState.status === 'loading'}
                  />
                </InlineStack>
                <Text as="span" variant="bodySm" tone="subdued">
                  {selectedJobIds.size} of {publishableJobs.length} selected
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        )}

        <Layout.Section>
          <BlockStack gap="200">
            {jobs.map((job) => (
              <JobProgressCard
                key={job.id}
                job={job}
                showCheckbox={job.status === 'succeeded' && !job.variations?.[0]?.publishedToShopify}
                selected={selectedJobIds.has(job.id)}
                onSelectChange={handleSelectChange}
              />
            ))}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

function ButtonGroupInline({ onSelectAll, onClear, onPublish, disabled, loading }) {
  return (
    <InlineStack gap="200">
      <Button onClick={onSelectAll}>Select all</Button>
      <Button onClick={onClear} disabled={disabled}>
        Clear
      </Button>
      <Button variant="primary" onClick={onPublish} disabled={disabled} loading={loading}>
        Publish selected
      </Button>
    </InlineStack>
  );
}
