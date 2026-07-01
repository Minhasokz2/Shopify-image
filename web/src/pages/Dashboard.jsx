import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Banner,
  Spinner,
  EmptyState,
  Badge,
  Box,
} from '@shopify/polaris';
import { apiClient } from '../api/client.js';
import { CreditBalanceBadge } from '../components/CreditBalanceBadge.jsx';

const STATUS_TONE = {
  succeeded: 'success',
  failed: 'critical',
  processing: 'info',
  pending: 'attention',
};

function useRecentJobs() {
  return useQuery({
    queryKey: ['jobs', 'recent'],
    queryFn: () => apiClient.get('/api/jobs?limit=5'),
  });
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useRecentJobs();
  const jobs = data?.jobs ?? [];

  return (
    <Page
      title="VisualKit"
      subtitle="AI product photos, UGC, and video — generated in a click"
      primaryAction={{ content: 'Pick products', onAction: () => navigate('/products') }}
    >
      <Layout>
        <Layout.Section>
          {error ? (
            <Banner tone="critical" title="Couldn't load your dashboard">
              <p>{error.message}</p>
            </Banner>
          ) : null}
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Account status
                </Text>
                <CreditBalanceBadge />
              </InlineStack>
              <InlineStack gap="200">
                <Button onClick={() => navigate('/billing')}>Manage billing</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Quick generate
              </Text>
              <InlineStack gap="200">
                <Button variant="primary" onClick={() => navigate('/products')}>
                  Generate scene photos
                </Button>
                <Button onClick={() => navigate('/products')}>Generate UGC content</Button>
                <Button onClick={() => navigate('/products')}>Generate video</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Recent jobs
              </Text>
              {isLoading ? (
                <Box padding="400">
                  <InlineStack align="center">
                    <Spinner accessibilityLabel="Loading recent jobs" size="small" />
                  </InlineStack>
                </Box>
              ) : jobs.length === 0 ? (
                <EmptyState
                  heading="No generations yet"
                  action={{ content: 'Pick products', onAction: () => navigate('/products') }}
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>Generate your first AI product photo, UGC image, or video.</p>
                </EmptyState>
              ) : (
                <BlockStack gap="200">
                  {jobs.map((job) => (
                    <Box
                      key={job.id}
                      padding="300"
                      borderWidth="025"
                      borderColor="border"
                      borderRadius="200"
                    >
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="050">
                          <Text as="span" fontWeight="medium">
                            {job.contentType} · {job.templateId}
                          </Text>
                          <Text as="span" variant="bodySm" tone="subdued">
                            {new Date(job.createdAt).toLocaleString()}
                          </Text>
                        </BlockStack>
                        <InlineStack gap="200" blockAlign="center">
                          <Badge tone={STATUS_TONE[job.status] ?? 'info'}>{job.status}</Badge>
                          <Button onClick={() => navigate(`/review/${job.id}`)}>View</Button>
                        </InlineStack>
                      </InlineStack>
                    </Box>
                  ))}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
