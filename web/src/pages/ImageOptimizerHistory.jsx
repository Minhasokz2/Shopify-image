import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  IndexTable,
  InlineStack,
  Page,
  Spinner,
  Text,
  Thumbnail,
} from '@shopify/polaris';
import { ExportIcon } from '@shopify/polaris-icons';
import { apiClient } from '../api/client.js';
import { useImageOptimizerHistory } from '../hooks/useImageOptimizer.js';

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

// Builds a CSV client-side from data already fetched for the table — a dedicated server export
// endpoint would just re-serialize the same rows, so there's nothing to gain from a round trip.
function downloadCsv(jobs) {
  const header = ['id', 'status', 'inputFormat', 'outputFormats', 'originalBytes', 'savedBytes', 'createdAt'];
  const rows = jobs.map((job) => [
    job.id,
    job.status,
    job.inputFormat,
    (job.outputFormats ?? []).join('+'),
    job.originalBytes ?? '',
    job.savedBytes ?? '',
    job.createdAt ? new Date(job.createdAt).toISOString() : '',
  ]);
  const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `image-optimizer-history-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ImageOptimizerHistory() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useImageOptimizerHistory();
  const queryClient = useQueryClient();
  const [restoreError, setRestoreError] = useState(null);
  const [restoringId, setRestoringId] = useState(null);
  const jobs = data?.jobs ?? [];

  const restoreMutation = useMutation({
    mutationFn: (jobId) => apiClient.post(`/api/image-optimizer/jobs/${jobId}/restore`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['image-optimizer', 'history'] }),
  });

  const handleRestore = async (jobId) => {
    setRestoreError(null);
    setRestoringId(jobId);
    try {
      await restoreMutation.mutateAsync(jobId);
    } catch (err) {
      setRestoreError(err.message);
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <Page
      title="Conversion History"
      backAction={{ content: 'Convert Images', onAction: () => navigate('/image-optimizer') }}
      primaryAction={{
        content: 'Export CSV',
        icon: ExportIcon,
        onAction: () => downloadCsv(jobs),
        disabled: jobs.length === 0,
      }}
    >
      {error ? (
        <Banner tone="critical" title="Couldn't load history">
          <p>{error.message}</p>
        </Banner>
      ) : null}
      {restoreError ? (
        <Banner tone="critical" title="Couldn't restore" onDismiss={() => setRestoreError(null)}>
          <p>{restoreError}</p>
        </Banner>
      ) : null}

      <Card padding="0">
        {isLoading ? (
          <InlineStack align="center">
            <Spinner accessibilityLabel="Loading history" size="small" />
          </InlineStack>
        ) : jobs.length === 0 ? (
          <EmptyState
            heading="No conversions yet"
            action={{ content: 'Convert images', onAction: () => navigate('/image-optimizer') }}
            image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
          >
            <p>Convert your first product image to see it show up here.</p>
          </EmptyState>
        ) : (
          <IndexTable
            resourceName={{ singular: 'conversion', plural: 'conversions' }}
            itemCount={jobs.length}
            selectable={false}
            headings={[
              { title: '' },
              { title: 'Format' },
              { title: 'Status' },
              { title: 'Original size' },
              { title: 'Saved' },
              { title: 'Date' },
              { title: '' },
            ]}
          >
            {jobs.map((job, index) => (
              <IndexTable.Row id={job.id} key={job.id} position={index}>
                <IndexTable.Cell>
                  <Thumbnail source={job.outputAssets?.[0]?.url || job.inputUrl} alt="" size="small" />
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span">
                    {(job.inputFormat ?? '').toUpperCase()} → {(job.outputFormats ?? []).join(' + ').toUpperCase()}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge tone={STATUS_TONE[job.status] ?? 'info'}>{job.status}</Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>{formatBytes(job.originalBytes)}</IndexTable.Cell>
                <IndexTable.Cell>{formatBytes(job.savedBytes)}</IndexTable.Cell>
                <IndexTable.Cell>{job.createdAt ? new Date(job.createdAt).toLocaleDateString() : '—'}</IndexTable.Cell>
                <IndexTable.Cell>
                  {job.status === 'done' && job.replaceInPlace ? (
                    <Button
                      size="slim"
                      loading={restoringId === job.id}
                      onClick={() => handleRestore(job.id)}
                    >
                      Restore original
                    </Button>
                  ) : null}
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        )}
      </Card>
    </Page>
  );
}
