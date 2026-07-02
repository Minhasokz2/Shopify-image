import { useEffect, useState } from 'react';
import {
  BlockStack,
  Banner,
  Box,
  Button,
  Card,
  EmptyState,
  InlineStack,
  Layout,
  Page,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import { WandIcon, PaintBrushFlatIcon } from '@shopify/polaris-icons';
import { apiClient } from '../api/client.js';
import { SectionHeading } from '../components/SectionHeading.jsx';

const MIN_URLS = 3;
const MAX_URLS = 5;

function isValidUrl(value) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export default function BrandSettings() {
  const [urls, setUrls] = useState(['', '', '']);
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState(null);
  const [validationError, setValidationError] = useState(null);

  useEffect(() => {
    apiClient
      .get('/api/brand-style')
      .then((data) => setProfile(data.brandStyleProfile))
      .catch((err) => setError(err.message))
      .finally(() => setLoadingProfile(false));
  }, []);

  const handleUrlChange = (index, value) => {
    setUrls((prev) => prev.map((url, i) => (i === index ? value : url)));
  };

  const handleAddUrl = () => {
    if (urls.length < MAX_URLS) setUrls((prev) => [...prev, '']);
  };

  const handleRemoveUrl = (index) => {
    if (urls.length > MIN_URLS) setUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    setValidationError(null);
    setError(null);

    const trimmed = urls.map((url) => url.trim()).filter(Boolean);
    if (trimmed.length < MIN_URLS || trimmed.length > MAX_URLS) {
      setValidationError(`Enter between ${MIN_URLS} and ${MAX_URLS} product page URLs.`);
      return;
    }
    const invalid = trimmed.filter((url) => !isValidUrl(url));
    if (invalid.length > 0) {
      setValidationError(`Not a valid URL: ${invalid.join(', ')}`);
      return;
    }

    setExtracting(true);
    try {
      const data = await apiClient.post('/api/brand-style/extract', { productPageUrls: trimmed });
      setProfile(data.brandStyleProfile);
    } catch (err) {
      setError(err.message);
    } finally {
      setExtracting(false);
    }
  };

  return (
    <Page title="Brand Settings">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <SectionHeading icon={WandIcon}>Extract your brand style</SectionHeading>
              <Text as="p" tone="subdued">
                Add 3-5 of your product page URLs. MotionArt reads them and extracts a color palette and tone of
                voice that gets applied to every generation.
              </Text>

              <Box borderWidth="025" borderColor="border" borderRadius="200" padding="300">
                <BlockStack gap="200">
                  {urls.map((url, index) => (
                    <InlineStack key={index} gap="200" blockAlign="end" wrap={false}>
                      <div style={{ flexGrow: 1 }}>
                        <TextField
                          label={`Product page URL ${index + 1}`}
                          labelHidden={index !== 0}
                          value={url}
                          onChange={(value) => handleUrlChange(index, value)}
                          autoComplete="off"
                          placeholder="https://yourstore.com/products/example"
                        />
                      </div>
                      {urls.length > MIN_URLS && (
                        <Button onClick={() => handleRemoveUrl(index)} accessibilityLabel="Remove URL">
                          Remove
                        </Button>
                      )}
                    </InlineStack>
                  ))}
                </BlockStack>
              </Box>

              <InlineStack gap="200">
                {urls.length < MAX_URLS && <Button onClick={handleAddUrl}>Add another URL</Button>}
                <Button variant="primary" onClick={handleSubmit} loading={extracting}>
                  Extract brand style
                </Button>
              </InlineStack>

              {validationError && <Banner tone="warning">{validationError}</Banner>}
              {error && <Banner tone="critical">{error}</Banner>}
              {extracting && (
                <InlineStack gap="200" blockAlign="center">
                  <Spinner size="small" />
                  <Text as="span">Fetching product pages and extracting style — this can take a few seconds…</Text>
                </InlineStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <SectionHeading icon={PaintBrushFlatIcon}>Current brand style</SectionHeading>
              {loadingProfile ? (
                <Box padding="400">
                  <InlineStack align="center">
                    <Spinner accessibilityLabel="Loading brand style" size="small" />
                  </InlineStack>
                </Box>
              ) : !profile ? (
                <EmptyState
                  heading="No brand style extracted yet"
                  image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
                >
                  <p>Add your product page URLs above and extract a style to see it here.</p>
                </EmptyState>
              ) : (
                <BlockStack gap="300">
                  <Box borderWidth="025" borderColor="border" borderRadius="200" padding="300">
                    <BlockStack gap="150">
                      <Text as="h3" variant="headingSm">
                        Palette
                      </Text>
                      <InlineStack gap="200">
                        {(profile.palette ?? []).map((hex) => (
                          <div key={hex} style={{ textAlign: 'center' }}>
                            <div
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 6,
                                backgroundColor: hex,
                                border: '1px solid rgba(0,0,0,0.1)',
                              }}
                            />
                            <Text as="span" variant="bodySm" tone="subdued">
                              {hex}
                            </Text>
                          </div>
                        ))}
                      </InlineStack>
                    </BlockStack>
                  </Box>
                  <Box borderWidth="025" borderColor="border" borderRadius="200" padding="300">
                    <BlockStack gap="150">
                      <Text as="h3" variant="headingSm">
                        Tone
                      </Text>
                      <Text as="p">{profile.tone}</Text>
                    </BlockStack>
                  </Box>
                  {profile.extractedAt && (
                    <Text as="span" variant="bodySm" tone="subdued">
                      Last extracted {new Date(profile.extractedAt).toLocaleString()}
                    </Text>
                  )}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
