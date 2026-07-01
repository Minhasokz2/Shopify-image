import { Router } from 'express';
import { shopify } from '../../config/shopify.js';
import { productsRepo } from '../../models/productsRepo.js';

const router = Router();

const PRODUCTS_QUERY = `#graphql
  query Products($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      edges {
        node {
          id
          title
          status
          productType
          tags
          featuredImage { url }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

function normalizeProduct(node) {
  return {
    id: node.id,
    title: node.title,
    status: node.status,
    productCategoryTag: (node.productType || node.tags?.[0] || '').toLowerCase() || null,
    imageUrl: node.featuredImage?.url ?? null,
  };
}

// GET /api/products — paginated catalog fetch via Admin GraphQL, cached in Firestore. The first
// page (no cursor) always re-pulls live from Shopify for incremental refresh; deeper pages are
// fetched live too since GraphQL cursors aren't stable across a cache boundary, but every page
// that's fetched is written back to the cache for the Product Picker's initial fast paint.
router.get('/products', async (req, res) => {
  const { cursor, cacheOnly } = req.query;

  if (cacheOnly === 'true') {
    const cached = await productsRepo.findByShop(req.shopDomain);
    return res.json({ products: cached, pageInfo: { hasNextPage: false, endCursor: null } });
  }

  const client = new shopify.api.clients.Graphql({ session: req.shopSession });
  const response = await client.request(PRODUCTS_QUERY, {
    variables: { first: 50, after: typeof cursor === 'string' ? cursor : null },
  });

  const products = response.data.products.edges.map(({ node }) => normalizeProduct(node));
  await productsRepo.upsertMany(req.shopDomain, products);

  return res.json({ products, pageInfo: response.data.products.pageInfo });
});

export default router;
