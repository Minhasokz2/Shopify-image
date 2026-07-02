import { useEffect, useState } from 'react';
import {
  BlockStack,
  Badge,
  Banner,
  Box,
  Button,
  Card,
  EmptyState,
  IndexTable,
  InlineStack,
  Layout,
  Page,
  Spinner,
  Text,
} from '@shopify/polaris';
import { GiftCardIcon, CashDollarIcon, PersonAddIcon, DuplicateIcon, ClipboardCheckIcon } from '@shopify/polaris-icons';
import { apiClient } from '../api/client.js';
import { SectionHeading } from '../components/SectionHeading.jsx';

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

export default function Referrals() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiClient
      .get('/api/referrals')
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleCopy = async () => {
    if (!data?.referralCode) return;
    await navigator.clipboard.writeText(data.referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Page title="Referrals">
      <Layout>
        {error && (
          <Layout.Section>
            <Banner tone="critical">{error}</Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <SectionHeading icon={GiftCardIcon}>Your referral code</SectionHeading>
              {loading ? (
                <Box padding="400">
                  <InlineStack align="center">
                    <Spinner accessibilityLabel="Loading referral code" size="small" />
                  </InlineStack>
                </Box>
              ) : !data?.referralCode ? (
                <EmptyState
                  heading="No referral code yet"
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>A referral code will appear here once one has been generated for this shop.</p>
                </EmptyState>
              ) : (
                <Box background="bg-surface-secondary" padding="400" borderRadius="300">
                  <InlineStack align="space-between" blockAlign="center" gap="400" wrap>
                    <StatBlock value={data.referralCode} label="Share this code with other merchants" />
                    <Button icon={copied ? ClipboardCheckIcon : DuplicateIcon} onClick={handleCopy}>
                      {copied ? 'Copied!' : 'Copy to clipboard'}
                    </Button>
                  </InlineStack>
                </Box>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <SectionHeading icon={CashDollarIcon} variant="headingSm">
                Referral earnings
              </SectionHeading>
              <StatBlock
                value={`$${(data?.totalCommissionOwedUSD ?? 0).toFixed(2)}`}
                label="Total commission owed"
              />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
            <Box padding="400">
              <SectionHeading icon={PersonAddIcon} variant="headingSm">
                Referred shops
              </SectionHeading>
            </Box>
            {!loading && (data?.referrals ?? []).length === 0 ? (
              <EmptyState
                heading="No referrals yet"
                image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
              >
                <p>Share your referral code with other merchants to start earning commission.</p>
              </EmptyState>
            ) : (
              <IndexTable
                loading={loading}
                resourceName={{ singular: 'referral', plural: 'referrals' }}
                itemCount={data?.referrals?.length ?? 0}
                headings={[
                  { title: 'Referred shop' },
                  { title: 'Status' },
                  { title: 'Commission owed' },
                ]}
                selectable={false}
              >
                {(data?.referrals ?? []).map((referral, index) => (
                  <IndexTable.Row id={`${referral.referredShop}-${index}`} key={`${referral.referredShop}-${index}`} position={index}>
                    <IndexTable.Cell>{referral.referredShop}</IndexTable.Cell>
                    <IndexTable.Cell>
                      <Badge tone={referral.status === 'converted' ? 'success' : 'info'}>{referral.status}</Badge>
                    </IndexTable.Cell>
                    <IndexTable.Cell>${(referral.commissionOwedUSD ?? 0).toFixed(2)}</IndexTable.Cell>
                  </IndexTable.Row>
                ))}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
