import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Modal,
  TextField,
  Banner,
  InlineStack,
  Spinner,
  EmptyState,
  Box,
  Thumbnail,
  Text,
  BlockStack,
  Button,
} from '@shopify/polaris';
import { apiClient } from '../api/client.js';

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

// Reusable searchable single-select product picker — currently used by GenerationReview.jsx to
// let a merchant publish a result to any product in their catalog, not just the one the job was
// originally created for.
export function ProductPickerModal({ title = 'Choose a product', onClose, onSelect }) {
  const [search, setSearch] = useState('');
  const [cursor, setCursor] = useState(undefined);
  const [allProducts, setAllProducts] = useState([]);
  const { data, isLoading, error } = useProducts(cursor);

  const products = useMemo(() => {
    const seen = new Map();
    for (const p of allProducts) seen.set(p.id, p);
    for (const p of data?.products ?? []) seen.set(p.id, p);
    return Array.from(seen.values());
  }, [allProducts, data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((p) => p.title.toLowerCase().includes(term));
  }, [products, search]);

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

  return (
    <Modal open onClose={onClose} title={title} size="large">
      <Modal.Section>
        <BlockStack gap="300">
          <TextField
            label="Search products"
            labelHidden
            placeholder="Search by title"
            value={search}
            onChange={setSearch}
            autoComplete="off"
            clearButton
            onClearButtonClick={() => setSearch('')}
          />

          {error ? (
            <Banner tone="critical" title="Couldn't load products">
              <p>{error.message}</p>
            </Banner>
          ) : null}

          {isLoading && products.length === 0 ? (
            <InlineStack align="center">
              <Spinner accessibilityLabel="Loading products" size="small" />
            </InlineStack>
          ) : filtered.length === 0 ? (
            <EmptyState heading="No products found" image="">
              <p>Try a different search term.</p>
            </EmptyState>
          ) : (
            <InlineStack gap="300" wrap>
              {filtered.map((product) => (
                <Box key={product.id} padding="150" borderWidth="025" borderColor="border" borderRadius="200">
                  <Button variant="plain" onClick={() => onSelect(product)}>
                    <BlockStack gap="100" inlineAlign="center">
                      <Thumbnail source={product.imageUrl || ''} alt={product.title} size="large" />
                      <Text as="span" variant="bodySm" tone="subdued">
                        {product.title}
                      </Text>
                    </BlockStack>
                  </Button>
                </Box>
              ))}
            </InlineStack>
          )}

          {data?.pageInfo?.hasNextPage ? (
            <InlineStack align="center">
              <Button onClick={loadMore} loading={isLoading}>
                Load more
              </Button>
            </InlineStack>
          ) : null}
        </BlockStack>
      </Modal.Section>
    </Modal>
  );
}
