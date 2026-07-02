import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Page,
  Card,
  BlockStack,
  InlineStack,
  Text,
  TextField,
  Button,
  Banner,
  Spinner,
  EmptyState,
  Checkbox,
  Thumbnail,
  Box,
} from '@shopify/polaris';
import { apiClient } from '../api/client.js';
import { StickyActionBar } from '../components/StickyActionBar.jsx';

function useProducts(cursor) {
  return useQuery({
    queryKey: ['products', cursor ?? null],
    queryFn: () => {
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      const qs = params.toString();
      return apiClient.get(`/api/products${qs ? `?${qs}` : ''}`);
    },
  });
}

export default function ProductPicker() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [allProducts, setAllProducts] = useState([]);
  const [cursor, setCursor] = useState(undefined);
  const { data, isLoading, error } = useProducts(cursor);

  const products = useMemo(() => {
    const seen = new Map();
    for (const p of allProducts) seen.set(p.id, p);
    for (const p of data?.products ?? []) seen.set(p.id, p);
    return Array.from(seen.values());
  }, [allProducts, data]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) =>
        p.title.toLowerCase().includes(term) ||
        (p.productCategoryTag ?? '').toLowerCase().includes(term),
    );
  }, [products, search]);

  const toggleSelected = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadMore = () => {
    if (data?.products) {
      setAllProducts((prev) => {
        const seen = new Map(prev.map((p) => [p.id, p]));
        for (const p of data.products) seen.set(p.id, p);
        return Array.from(seen.values());
      });
    }
    setCursor(data?.pageInfo?.endCursor);
  };

  const selectedProducts = products.filter((p) => selectedIds.has(p.id));

  const handleContinue = () => {
    navigate('/generate-method', { state: { selectedProducts } });
  };

  return (
    <Page
      title="Select products"
      subtitle="Choose one or more products to generate new visuals for"
      backAction={{ content: 'Dashboard', onAction: () => navigate('/') }}
    >
      <BlockStack gap="400">
        <StickyActionBar edge="top">
          <InlineStack align="end">
            <Button variant="primary" disabled={selectedIds.size === 0} onClick={handleContinue}>
              {`Continue (${selectedIds.size})`}
            </Button>
          </InlineStack>
        </StickyActionBar>

        {error ? (
          <Banner tone="critical" title="Couldn't load products">
            <p>{error.message}</p>
          </Banner>
        ) : null}

        <Card>
          <TextField
            label="Search products"
            labelHidden
            placeholder="Search by title or category"
            value={search}
            onChange={setSearch}
            autoComplete="off"
            clearButton
            onClearButtonClick={() => setSearch('')}
          />
        </Card>

        <Card>
          {isLoading && products.length === 0 ? (
            <Box padding="400">
              <InlineStack align="center">
                <Spinner accessibilityLabel="Loading products" size="small" />
              </InlineStack>
            </Box>
          ) : filteredProducts.length === 0 ? (
            <EmptyState heading="No products found" image="">
              <p>Try a different search term.</p>
            </EmptyState>
          ) : (
            <BlockStack gap="200">
              {filteredProducts.map((product) => (
                <Box
                  key={product.id}
                  padding="300"
                  borderWidth="025"
                  borderColor="border"
                  borderRadius="200"
                >
                  <InlineStack gap="300" blockAlign="center">
                    <Checkbox
                      label={`Select ${product.title}`}
                      labelHidden
                      checked={selectedIds.has(product.id)}
                      onChange={() => toggleSelected(product.id)}
                    />
                    <Thumbnail
                      source={product.imageUrl || ''}
                      alt={product.title}
                      size="small"
                    />
                    <BlockStack gap="050">
                      <Text as="span" fontWeight="medium">
                        {product.title}
                      </Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {product.status}
                        {product.productCategoryTag ? ` · ${product.productCategoryTag}` : ''}
                      </Text>
                    </BlockStack>
                  </InlineStack>
                </Box>
              ))}
            </BlockStack>
          )}
        </Card>

        {data?.pageInfo?.hasNextPage ? (
          <InlineStack align="center">
            <Button onClick={loadMore} loading={isLoading}>
              Load more
            </Button>
          </InlineStack>
        ) : null}
      </BlockStack>
    </Page>
  );
}
