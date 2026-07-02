import { useParams, useNavigate } from 'react-router-dom';
import { BlockStack, Badge, Banner, Card, InlineStack, Layout, Page, ProgressBar, Spinner, Text, Thumbnail } from '@shopify/polaris';
import { useConversionBatchPolling } from '../hooks/useImageOptimizer.js';

const STATUS_TONE = {
  queued: 'info',
  processing: 'attention',
  done: 'success',
  failed: 'critical',
  restored: 'info',
};

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function ConversionJobRow({ job }) {
  const tone = STATUS_TONE[job.status] ?? 'info';
  const primaryOutput = job.outputAssets?.[0];

  return (
    <Card padding="300">
      <InlineStack gap="300" blockAlign="center" wrap={false}>
        <Thumbnail source={primaryOutput?.url || job.inputUrl} alt="" size="small" />
        <BlockStack gap="050">
          <InlineStack gap="200" blockAlign="center">
            <Text as="span" fontWeight="semibold">
              {(job.inputFormat ?? '').toUpperCase()} → {(job.outputFormats ?? []).join(' + ').toUpperCase()}
            </Text>
            <Badge tone={tone}>{job.status}</Badge>
          </InlineStack>
          <Text as="span" variant="bodySm" tone="subdued">
            {job.status === 'done'
              ? `${formatBytes(job.originalBytes)} → ${formatBytes(job.originalBytes - (job.savedBytes ?? 0))} (saved ${formatBytes(job.savedBytes)})`
              : job.status === 'failed'
                ? job.errorMessage || 'Something went wrong.'
                : 'Waiting…'}
          </Text>
        </BlockStack>
      </InlineStack>
    </Card>
  );
}

export default function ImageOptimizerBatch() {
  const { batchId } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useConversionBatchPolling(batchId);
  const batch = data?.batch;
  const jobs = data?.jobs ?? [];

  if (isLoading && !batch) {
    return (
      <Page title="Converting images">
        <Layout>
          <Layout.Section>
            <Card>
              <InlineStack gap="200" blockAlign="center">
                <Spinner size="small" />
                <Text as="span">Loading…</Text>
              </InlineStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  if (!batch) {
    return (
      <Page title="Converting images">
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
    <Page
      title="Converting images"
      backAction={{ content: 'Conversion History', onAction: () => navigate('/image-optimizer/history') }}
      primaryAction={{ content: 'Conversion history', onAction: () => navigate('/image-optimizer/history') }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between">
                <Text as="h2" variant="headingMd">
                  {batch.status === 'processing'
                    ? 'Converting…'
                    : batch.status === 'complete'
                      ? 'All conversions complete'
                      : 'Finished with some failures'}
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

        <Layout.Section>
          <BlockStack gap="200">
            {jobs.map((job) => (
              <ConversionJobRow key={job.id} job={job} />
            ))}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
