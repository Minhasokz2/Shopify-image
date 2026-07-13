import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  InlineGrid,
  Text,
  Button,
  ButtonGroup,
  Banner,
  Spinner,
  EmptyState,
  Badge,
  Box,
  ProgressBar,
  Thumbnail,
  Tabs,
} from '@shopify/polaris';
import { ProductIcon, PersonIcon, CreditCardIcon, ExitIcon, WandIcon, ImagesIcon, ClockIcon } from '@shopify/polaris-icons';
import { apiClient } from '../api/client.js';
import { CreditBalanceBadge } from '../components/CreditBalanceBadge.jsx';
import { SectionHeading } from '../components/SectionHeading.jsx';
import { useCreditBalance } from '../hooks/useCreditBalance.js';
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

function StatBlock({ value, label }) {
  return (
    <BlockStack gap="050">
      <Text as="span" variant="headingLg">
        {value}
      </Text>
      <Text as="span" tone="subdued" variant="bodySm">
        {label}
      </Text>
    </BlockStack>
  );
}

const QUICK_GENERATE_TABS = [
  { id: 'catalog', content: 'From my catalog' },
  { id: 'upload', content: 'Upload & write a prompt' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [quickGenerateTab, setQuickGenerateTab] = useState(0);
  const { data, isLoading, error } = useRecentJobs();
  const { data: googleAccount } = useGoogleAccount();
  const { data: creditData } = useCreditBalance();
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

  const outOfCredits = creditData && creditData.creditBalance <= 0;
  const lowOnCredits = creditData && !outOfCredits && creditData.plan === 'free' && creditData.creditBalance <= 2;

  const conversionQuotaPct =
    imageOptimizerUsage && !imageOptimizerUsage.unlimited && imageOptimizerUsage.dailyLimit > 0
      ? (imageOptimizerUsage.remaining / imageOptimizerUsage.dailyLimit) * 100
      : null;

  return (
    <Page
      title="MotionArt"
      subtitle="AI product photos — generated in a click"
      primaryAction={{ content: 'Pick products', icon: ProductIcon, onAction: () => navigate('/products') }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="300">
            {error ? (
              <Banner tone="critical" title="Couldn't load your dashboard">
                <p>{error.message}</p>
              </Banner>
            ) : null}
            {outOfCredits ? (
              <Banner
                tone="critical"
                title="You're out of credits"
                action={{ content: 'Upgrade plan', onAction: () => navigate('/billing') }}
              >
                <p>Upgrade your plan or add more credits to keep generating photos.</p>
              </Banner>
            ) : lowOnCredits ? (
              <Banner
                tone="warning"
                title="Running low on credits"
                action={{ content: 'View plans', onAction: () => navigate('/billing') }}
              >
                <p>
                  You have {creditData.creditBalance} credit{creditData.creditBalance === 1 ? '' : 's'} left on the
                  free plan.
                </p>
              </Banner>
            ) : null}
          </BlockStack>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <SectionHeading icon={PersonIcon}>Account status</SectionHeading>
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
              <ButtonGroup>
                <Button icon={CreditCardIcon} onClick={() => navigate('/billing')}>
                  Manage billing
                </Button>
                <Button icon={ExitIcon} onClick={() => signOutMutation.mutate()} loading={signOutMutation.isPending}>
                  Sign out
                </Button>
              </ButtonGroup>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            <Box padding="400" paddingBlockEnd="0">
              <SectionHeading icon={WandIcon}>Quick generate</SectionHeading>
            </Box>
            <Tabs tabs={QUICK_GENERATE_TABS} selected={quickGenerateTab} onSelect={setQuickGenerateTab} />
            <Box padding="400">
              {/* UGC and video quick-actions are temporarily hidden — their providers (OpenAI,
                  WaveSpeed) aren't configured with real credentials yet. Re-add as sibling tiles
                  inside these same Boxes once they are. */}
              {quickGenerateTab === 0 ? (
                <Box background="bg-surface-secondary" padding="400" borderRadius="300">
                  <InlineStack align="space-between" blockAlign="center" gap="400" wrap>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">
                        Scene photos
                      </Text>
                      <Text as="p" tone="subdued" variant="bodySm">
                        Turn your catalog images into studio-quality product scenes.
                      </Text>
                    </BlockStack>
                    <Button variant="primary" icon={WandIcon} onClick={() => navigate('/products')}>
                      Generate scene photos
                    </Button>
                  </InlineStack>
                </Box>
              ) : (
                <Box background="bg-surface-secondary" padding="400" borderRadius="300">
                  <InlineStack align="space-between" blockAlign="center" gap="400" wrap>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm">
                        Upload your own image
                      </Text>
                      <Text as="p" tone="subdued" variant="bodySm">
                        No product needed — upload a reference photo, write your own prompt, and
                        pick which AI model generates it.
                      </Text>
                    </BlockStack>
                    <Button variant="primary" icon={WandIcon} onClick={() => navigate('/custom-generate')}>
                      Upload & generate
                    </Button>
                  </InlineStack>
                </Box>
              )}
            </Box>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <SectionHeading icon={ImagesIcon}>Compress Image</SectionHeading>
                <Button onClick={() => navigate('/image-optimizer')}>Convert images</Button>
              </InlineStack>
              <InlineGrid columns={{ xs: 1, sm: conversionQuotaPct !== null ? 3 : 2 }} gap="400">
                <StatBlock value={imageOptimizerUsage?.totalConverted ?? 0} label="Images converted" />
                <StatBlock
                  value={`${Math.round((imageOptimizerUsage?.totalSavedBytes ?? 0) / 1024)} KB`}
                  label="Total size saved"
                />
                {conversionQuotaPct !== null ? (
                  <BlockStack gap="150">
                    <StatBlock
                      value={`${imageOptimizerUsage.remaining}/${imageOptimizerUsage.dailyLimit}`}
                      label="Free conversions left today"
                    />
                    <ProgressBar
                      progress={conversionQuotaPct}
                      size="small"
                      tone={imageOptimizerUsage.remaining === 0 ? 'critical' : 'primary'}
                    />
                  </BlockStack>
                ) : null}
              </InlineGrid>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <SectionHeading icon={ClockIcon}>Recent jobs</SectionHeading>
                {jobs.length > 0 ? (
                  <Button variant="plain" onClick={() => navigate('/history')}>
                    View all
                  </Button>
                ) : null}
              </InlineStack>
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
                  <p>Generate your first AI product photo.</p>
                </EmptyState>
              ) : (
                <BlockStack gap="200">
                  {jobs.map((job) => (
                    <Box key={job.id} padding="300" borderWidth="025" borderColor="border" borderRadius="200">
                      <InlineStack align="space-between" blockAlign="center" gap="300">
                        <InlineStack gap="300" blockAlign="center">
                          <Thumbnail
                            source={job.variations?.[0]?.url || job.productImageUrl || ''}
                            alt={`${job.contentType} job`}
                            size="small"
                          />
                          <BlockStack gap="050">
                            <Text as="span" fontWeight="medium">
                              {job.contentType} · {job.templateId ?? 'Custom prompt'}
                            </Text>
                            <Text as="span" variant="bodySm" tone="subdued">
                              {new Date(job.createdAt).toLocaleString()}
                            </Text>
                          </BlockStack>
                        </InlineStack>
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
