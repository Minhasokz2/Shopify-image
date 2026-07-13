import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Page, Layout, Card, BlockStack, InlineStack, Text, Button, Banner, Box, Modal } from '@shopify/polaris';
import { ImagesIcon, EditIcon } from '@shopify/polaris-icons';
import { SectionHeading } from '../components/SectionHeading.jsx';
import { TemplatePicker } from '../components/TemplatePicker.jsx';

// The fork between the two ways to generate: a fixed-prompt template (fast, admin-curated) or a
// merchant-written custom prompt against an admin-allowed model (flexible, scene photos only).
// Both branches receive the same selectedProducts state so neither has to refetch the catalog.
// "Use a template" opens the picker as a popup right here instead of navigating away — the
// product is already selected by this point, so there's nothing the full /templates page offers
// that the popup doesn't; TemplateGallery.jsx still exists for the top-nav "browse with no
// product yet" entry point, reusing the exact same TemplatePicker content.
export default function GenerateMethod() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedProducts = location.state?.selectedProducts ?? [];
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);

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
                  <SectionHeading icon={ImagesIcon}>Use a template</SectionHeading>
                  <Box background="bg-surface-secondary" padding="400" borderRadius="300">
                    <BlockStack gap="300">
                      <Text as="p" tone="subdued">
                        Pick from admin-curated scene templates. Fastest way to generate — one click per
                        template.
                      </Text>
                      <Button
                        variant="primary"
                        disabled={selectedProducts.length === 0}
                        onClick={() => setTemplatesModalOpen(true)}
                      >
                        Browse templates
                      </Button>
                    </BlockStack>
                  </Box>
                </BlockStack>
              </Card>
            </Box>

            <Box minWidth="280px" maxWidth="360px">
              <Card>
                <BlockStack gap="300">
                  <SectionHeading icon={EditIcon}>Write a custom prompt</SectionHeading>
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

      {templatesModalOpen ? (
        <Modal open onClose={() => setTemplatesModalOpen(false)} title="Choose a template" size="large">
          <Modal.Section>
            <TemplatePicker
              selectedProducts={selectedProducts}
              onGenerated={(jobId) => {
                setTemplatesModalOpen(false);
                navigate(`/review/${jobId}`);
              }}
              onOpenTryOn={() => {
                setTemplatesModalOpen(false);
                navigate('/try-on');
              }}
            />
          </Modal.Section>
        </Modal>
      ) : null}
    </Page>
  );
}
