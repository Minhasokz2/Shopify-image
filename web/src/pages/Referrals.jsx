import { useEffect, useState } from 'react';
import { BlockStack, Badge, Banner, Button, Card, EmptyState, IndexTable, InlineStack, Layout, Page, Text } from '@shopify/polaris';
import { apiClient } from '../api/client.js';

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
              <Text as="h2" variant="headingMd">
                Your referral code
              </Text>
              {loading ? (
                <Text as="span" tone="subdued">
                  Loading…
                </Text>
              ) : !data?.referralCode ? (
                <Text as="p" tone="subdued">
                  No referral code has been generated for this shop yet.
                </Text>
              ) : (
                <InlineStack gap="200" blockAlign="center">
                  <Text as="span" variant="headingLg" fontWeight="bold">
                    {data.referralCode}
                  </Text>
                  <Button onClick={handleCopy}>{copied ? 'Copied!' : 'Copy to clipboard'}</Button>
                </InlineStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h3" variant="headingSm">
                Total commission owed
              </Text>
              <Text as="span" variant="headingLg">
                ${(data?.totalCommissionOwedUSD ?? 0).toFixed(2)}
              </Text>
            </InlineStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card padding="0">
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
