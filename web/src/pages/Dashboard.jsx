import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
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
import { useImageOptimizerUsage } from '../hooks/useImageOptimizer.js';

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

function useGoogleAccount() {
  return useQuery({
    queryKey: ['auth', 'google-status'],
    queryFn: () => apiClient.get('/api/auth/google/status'),
    staleTime: Infinity, // set once at sign-in; no reason to refetch mid-session
  });
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { data, isLoading, error } = useRecentJobs();
  const { data: googleAccount } = useGoogleAccount();
  const { data: imageOptimizerUsage } = useImageOptimizerUsage();
  const jobs = data?.jobs ?? [];
  const [signOutError, setSignOutError] = useState(null);

  // There's no separate client-side session to tear down — the Shopify embedded iframe stays
  // authenticated via App Bridge regardless. This just clears the shop's Google verification
  // server-side and reloads, so GoogleAuthGate re-mounts, re-checks status, and shows its lock
  // screen until someone verifies a Google account again.
  const signOutMutation = useMutation({
    mutationFn: () => apiClient.post('/api/auth/google/signout', {}),
    onSuccess: () => window.location.reload(),
    onError: (err) => setSignOutError(err.message || 'Failed to sign out.'),
  });

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
              {googleAccount?.googleEmail ? (
                <Text as="p" variant="bodySm" tone="subdued">
                  Signed in as {googleAccount.googleEmail}
                </Text>
              ) : null}
              {signOutError ? (
                <Banner tone="critical" onDismiss={() => setSignOutError(null)}>
                  {signOutError}
                </Banner>
              ) : null}
              <InlineStack gap="200">
                <Button onClick={() => navigate('/billing')}>Manage billing</Button>
                <Button onClick={() => signOutMutation.mutate()} loading={signOutMutation.isPending}>
                  Sign out
                </Button>
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
              {/* UGC and video quick-actions are temporarily hidden — their providers (OpenAI,
                  WaveSpeed) aren't configured with real credentials yet. Re-add
                  "Generate UGC content" / "Generate video" buttons (same onClick) once they are. */}
              <InlineStack gap="200">
                <Button variant="primary" onClick={() => navigate('/products')}>
                  Generate scene photos
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingMd">
                  Compress Image
                </Text>
                <Button onClick={() => navigate('/image-optimizer')}>Convert images</Button>
              </InlineStack>
              <InlineStack gap="600" wrap>
                <BlockStack gap="050">
                  <Text as="span" variant="headingLg">
                    {imageOptimizerUsage?.totalConverted ?? 0}
                  </Text>
                  <Text as="span" tone="subdued" variant="bodySm">
                    Images converted
                  </Text>
                </BlockStack>
                <BlockStack gap="050">
                  <Text as="span" variant="headingLg">
                    {Math.round((imageOptimizerUsage?.totalSavedBytes ?? 0) / 1024)} KB
                  </Text>
                  <Text as="span" tone="subdued" variant="bodySm">
                    Total size saved
                  </Text>
                </BlockStack>
                {imageOptimizerUsage && !imageOptimizerUsage.unlimited ? (
                  <BlockStack gap="050">
                    <Text as="span" variant="headingLg">
                      {imageOptimizerUsage.remaining}/{imageOptimizerUsage.dailyLimit}
                    </Text>
                    <Text as="span" tone="subdued" variant="bodySm">
                      Free conversions left today
                    </Text>
                  </BlockStack>
                ) : null}
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
