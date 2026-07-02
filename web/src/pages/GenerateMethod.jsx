import { useLocation, useNavigate } from 'react-router-dom';
import { Page, Layout, Card, BlockStack, InlineStack, Text, Button, Banner, Box } from '@shopify/polaris';

// The fork between the two ways to generate: a fixed-prompt template (fast, admin-curated) or a
// merchant-written custom prompt against an admin-allowed model (flexible, scene photos only).
// Both branches receive the same selectedProducts state so neither has to refetch the catalog.
export default function GenerateMethod() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedProducts = location.state?.selectedProducts ?? [];

  return (
    <Page
      title="How do you want to generate?"
      subtitle={
        selectedProducts.length > 0
          ? `Applying to ${selectedProducts.length} selected product${selectedProducts.length > 1 ? 's' : ''}`
          : 'No products selected'
      }
      backAction={{ content: 'Products', onAction: () => navigate('/products') }}
    >
      <Layout>
        <Layout.Section>
          {selectedProducts.length === 0 ? (
            <Banner tone="warning" title="No product selected">
              <p>Go back and select at least one product first.</p>
            </Banner>
          ) : null}
        </Layout.Section>

        <Layout.Section>
          <InlineStack gap="400" wrap>
            <Box minWidth="280px" maxWidth="360px">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Use a template
                  </Text>
                  <Text as="p" tone="subdued">
                    Pick from admin-curated scene templates. Fastest way to generate — one click per
                    template.
                  </Text>
                  <Button
                    variant="primary"
                    disabled={selectedProducts.length === 0}
                    onClick={() => navigate('/templates', { state: { selectedProducts } })}
                  >
                    Browse templates
                  </Button>
                </BlockStack>
              </Card>
            </Box>

            <Box minWidth="280px" maxWidth="360px">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Write a custom prompt
                  </Text>
                  <Text as="p" tone="subdued">
                    Select one or more product images, write your own prompt, and pick which AI model generates it.
                    Scene photos only, for now.
                  </Text>
                  <Button
                    disabled={selectedProducts.length === 0}
                    onClick={() => navigate('/custom-generate', { state: { selectedProducts } })}
                  >
                    Start custom prompt
                  </Button>
                </BlockStack>
              </Card>
            </Box>
          </InlineStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
