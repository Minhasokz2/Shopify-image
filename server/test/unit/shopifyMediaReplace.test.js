import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/firestore.js', async () => {
  const { createFakeFirestore } = await import('../helpers/fakeFirestore.js');
  const fake = createFakeFirestore();
  return { firestore: fake.firestore, FieldValue: fake.FieldValue, Timestamp: {} };
});

const { Session } = await import('@shopify/shopify-api');
const { shopify } = await import('../../src/config/shopify.js');
const { replaceProductImage, restoreProductImage, ShopifyMediaReplaceError } = await import(
  '../../src/services/shopifyMediaReplace.js'
);

const SHOP = 'media-replace-shop.myshopify.com';

beforeEach(async () => {
  vi.restoreAllMocks();
  // The offline session is loaded straight from session storage (not a live request's session
  // token) because this runs from the background conversion worker — see the service's own
  // comment on why. Seeded once per test via the real FirestoreSessionStorage, backed by the
  // fake firestore above, exactly as it would be in production.
  await shopify.config.sessionStorage.storeSession(
    new Session({
      id: `offline_${SHOP}`,
      shop: SHOP,
      state: 'test',
      isOnline: false,
      accessToken: 'shpat_totally_real',
      expires: new Date(Date.now() + 60 * 60 * 1000),
    }),
  );
});

describe('replaceProductImage', () => {
  it('adds the converted image as new media and returns its id', async () => {
    vi.spyOn(shopify.api.clients.Graphql.prototype, 'request').mockResolvedValue({
      data: { productCreateMedia: { media: [{ id: 'gid://shopify/MediaImage/new1' }], mediaUserErrors: [] } },
      headers: {},
    });

    const result = await replaceProductImage({
      shopDomain: SHOP,
      productId: 'gid://shopify/Product/1',
      oldMediaId: null,
      newImageUrl: 'https://res.cloudinary.com/optimized.jpg',
      replaceInPlace: false,
    });

    expect(result).toEqual({ newMediaId: 'gid://shopify/MediaImage/new1' });
  });

  it('deletes the old media after adding the new one when replaceInPlace is true', async () => {
    const requestSpy = vi
      .spyOn(shopify.api.clients.Graphql.prototype, 'request')
      .mockResolvedValueOnce({
        data: { productCreateMedia: { media: [{ id: 'gid://shopify/MediaImage/new2' }], mediaUserErrors: [] } },
        headers: {},
      })
      .mockResolvedValueOnce({
        data: { productDeleteMedia: { deletedMediaIds: ['gid://shopify/MediaImage/old2'], mediaUserErrors: [] } },
        headers: {},
      });

    const result = await replaceProductImage({
      shopDomain: SHOP,
      productId: 'gid://shopify/Product/1',
      oldMediaId: 'gid://shopify/MediaImage/old2',
      newImageUrl: 'https://res.cloudinary.com/optimized.jpg',
      replaceInPlace: true,
    });

    expect(result).toEqual({ newMediaId: 'gid://shopify/MediaImage/new2' });
    expect(requestSpy).toHaveBeenCalledTimes(2);
    expect(requestSpy.mock.calls[1][1].variables).toEqual({
      productId: 'gid://shopify/Product/1',
      mediaIds: ['gid://shopify/MediaImage/old2'],
    });
  });

  it('never attempts the delete step when replaceInPlace is true but there is no oldMediaId', async () => {
    const requestSpy = vi.spyOn(shopify.api.clients.Graphql.prototype, 'request').mockResolvedValue({
      data: { productCreateMedia: { media: [{ id: 'gid://shopify/MediaImage/new3' }], mediaUserErrors: [] } },
      headers: {},
    });

    await replaceProductImage({
      shopDomain: SHOP,
      productId: 'gid://shopify/Product/1',
      oldMediaId: null,
      newImageUrl: 'https://res.cloudinary.com/optimized.jpg',
      replaceInPlace: true,
    });

    expect(requestSpy).toHaveBeenCalledTimes(1); // create only, no delete call
  });

  it('throws ShopifyMediaReplaceError when the create step returns mediaUserErrors', async () => {
    vi.spyOn(shopify.api.clients.Graphql.prototype, 'request').mockResolvedValue({
      data: { productCreateMedia: { media: [], mediaUserErrors: [{ field: ['media'], message: 'Invalid media URL' }] } },
      headers: {},
    });

    await expect(
      replaceProductImage({
        shopDomain: SHOP,
        productId: 'gid://shopify/Product/1',
        oldMediaId: null,
        newImageUrl: 'not-a-url',
        replaceInPlace: false,
      }),
    ).rejects.toBeInstanceOf(ShopifyMediaReplaceError);
  });

  it('throws ShopifyMediaReplaceError when the delete step returns mediaUserErrors, even though the new media was already added', async () => {
    vi.spyOn(shopify.api.clients.Graphql.prototype, 'request')
      .mockResolvedValueOnce({
        data: { productCreateMedia: { media: [{ id: 'gid://shopify/MediaImage/new4' }], mediaUserErrors: [] } },
        headers: {},
      })
      .mockResolvedValueOnce({
        data: { productDeleteMedia: { deletedMediaIds: [], mediaUserErrors: [{ field: ['mediaIds'], message: 'Media not found' }] } },
        headers: {},
      });

    await expect(
      replaceProductImage({
        shopDomain: SHOP,
        productId: 'gid://shopify/Product/1',
        oldMediaId: 'gid://shopify/MediaImage/gone',
        newImageUrl: 'https://res.cloudinary.com/optimized.jpg',
        replaceInPlace: true,
      }),
    ).rejects.toBeInstanceOf(ShopifyMediaReplaceError);
  });

  it('throws ShopifyMediaReplaceError (not a generic error) when no offline session exists for the shop', async () => {
    await expect(
      replaceProductImage({
        shopDomain: 'uninstalled-shop.myshopify.com',
        productId: 'gid://shopify/Product/1',
        oldMediaId: null,
        newImageUrl: 'https://res.cloudinary.com/optimized.jpg',
        replaceInPlace: false,
      }),
    ).rejects.toBeInstanceOf(ShopifyMediaReplaceError);
  });
});

describe('restoreProductImage', () => {
  it('re-adds the original image as new media', async () => {
    const requestSpy = vi.spyOn(shopify.api.clients.Graphql.prototype, 'request').mockResolvedValue({
      data: { productCreateMedia: { media: [{ id: 'gid://shopify/MediaImage/restored' }], mediaUserErrors: [] } },
      headers: {},
    });

    await restoreProductImage({
      shopDomain: SHOP,
      productId: 'gid://shopify/Product/1',
      originalImageUrl: 'https://res.cloudinary.com/original.jpg',
    });

    expect(requestSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        variables: {
          productId: 'gid://shopify/Product/1',
          media: [{ originalSource: 'https://res.cloudinary.com/original.jpg', mediaContentType: 'IMAGE', alt: 'Restored original image' }],
        },
      }),
    );
  });

  it('throws ShopifyMediaReplaceError when Shopify returns mediaUserErrors', async () => {
    vi.spyOn(shopify.api.clients.Graphql.prototype, 'request').mockResolvedValue({
      data: { productCreateMedia: { media: [], mediaUserErrors: [{ field: ['media'], message: 'Invalid media URL' }] } },
      headers: {},
    });

    await expect(
      restoreProductImage({ shopDomain: SHOP, productId: 'gid://shopify/Product/1', originalImageUrl: 'bad-url' }),
    ).rejects.toBeInstanceOf(ShopifyMediaReplaceError);
  });
});
