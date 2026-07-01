import { useEffect, useState } from 'react';
import { Badge, BlockStack, Banner, Button, Card, EmptyState, IndexTable, InlineStack, Layout, Page, Select, Text, Thumbnail } from '@shopify/polaris';
import { apiClient } from '../api/client.js';

const STATUS_OPTIONS = [
  { label: 'All statuses', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Processing', value: 'processing' },
  { label: 'Succeeded', value: 'succeeded' },
  { label: 'Failed', value: 'failed' },
];

const CONTENT_TYPE_OPTIONS = [
  { label: 'All content types', value: '' },
  { label: 'Scene', value: 'scene' },
  { label: 'UGC', value: 'ugc' },
  { label: 'Video', value: 'video' },
];

const STATUS_TONE = {
  pending: 'info',
  processing: 'attention',
  succeeded: 'success',
  failed: 'critical',
};

export default function JobHistory() {
  const [status, setStatus] = useState('');
  const [contentType, setContentType] = useState('');
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [republishState, setRepublishState] = useState({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (contentType) params.set('contentType', contentType);
    const query = params.toString();

    apiClient
      .get(`/api/jobs${query ? `?${query}` : ''}`)
      .then((data) => {
        if (!cancelled) setJobs(data.jobs ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [status, contentType]);

  const handleRedownload = (job) => {
    const url = job.variations?.[0]?.url;
    if (url) window.open(url, '_blank', 'noopener');
  };

  const handleRepublish = async (job) => {
    setRepublishState((prev) => ({ ...prev, [job.id]: { status: 'loading' } }));
    try {
      await apiClient.post(`/api/jobs/${job.id}/publish`, { productId: job.productId });
      setRepublishState((prev) => ({ ...prev, [job.id]: { status: 'success' } }));
    } catch (err) {
      setRepublishState((prev) => ({ ...prev, [job.id]: { status: 'error', error: err.message } }));
    }
  };

  return (
    <Page title="Job History">
      <Layout>
        <Layout.Section>
          <Card>
            <InlineStack gap="300">
              <div style={{ minWidth: 200 }}>
                <Select label="Status" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
              </div>
              <div style={{ minWidth: 200 }}>
                <Select
                  label="Content type"
                  options={CONTENT_TYPE_OPTIONS}
                  value={contentType}
                  onChange={setContentType}
                />
              </div>
            </InlineStack>
          </Card>
        </Layout.Section>

        {error && (
          <Layout.Section>
            <Banner tone="critical">{error}</Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card padding="0">
            {!loading && jobs.length === 0 ? (
              <EmptyState
                heading="No jobs yet"
                image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
              >
                <p>Generate some content to see it show up here.</p>
              </EmptyState>
            ) : (
              <IndexTable
                loading={loading}
                resourceName={{ singular: 'job', plural: 'jobs' }}
                itemCount={jobs.length}
                headings={[
                  { title: 'Preview' },
                  { title: 'Content type' },
                  { title: 'Template' },
                  { title: 'Status' },
                  { title: 'Credits' },
                  { title: 'Created' },
                  { title: 'Actions' },
                ]}
                selectable={false}
              >
                {jobs.map((job, index) => {
                  const previewUrl = job.variations?.[0]?.url;
                  const republish = republishState[job.id];
                  return (
                    <IndexTable.Row id={job.id} key={job.id} position={index}>
                      <IndexTable.Cell>
                        {job.contentType === 'video' && previewUrl ? (
                          <video src={previewUrl} style={{ width: 40, height: 40, objectFit: 'cover' }} muted />
                        ) : (
                          <Thumbnail
                            source={previewUrl || job.productImageUrl || ''}
                            alt={`Job ${job.id}`}
                            size="small"
                          />
                        )}
                      </IndexTable.Cell>
                      <IndexTable.Cell>{job.contentType}</IndexTable.Cell>
                      <IndexTable.Cell>{job.templateId}</IndexTable.Cell>
                      <IndexTable.Cell>
                        <Badge tone={STATUS_TONE[job.status] ?? 'info'}>{job.status}</Badge>
                      </IndexTable.Cell>
                      <IndexTable.Cell>{job.creditsCharged ?? 0}</IndexTable.Cell>
                      <IndexTable.Cell>
                        {job.createdAt ? new Date(job.createdAt).toLocaleDateString() : '—'}
                      </IndexTable.Cell>
                      <IndexTable.Cell>
                        <InlineStack gap="200">
                          <Button size="slim" disabled={!previewUrl} onClick={() => handleRedownload(job)}>
                            Re-download
                          </Button>
                          <Button
                            size="slim"
                            disabled={job.status !== 'succeeded'}
                            loading={republish?.status === 'loading'}
                            onClick={() => handleRepublish(job)}
                          >
                            {republish?.status === 'success' ? 'Published' : 'Re-publish'}
                          </Button>
                        </InlineStack>
                        {republish?.status === 'error' && (
                          <Text as="p" variant="bodySm" tone="critical">
                            {republish.error}
                          </Text>
                        )}
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
