import { shopify } from '../config/shopify.js';

export class ShopifyMediaReplaceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ShopifyMediaReplaceError';
    this.statusCode = 422;
  }
}

const PRODUCT_CREATE_MEDIA_MUTATION = `#graphql
  mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
    productCreateMedia(productId: $productId, media: $media) {
      media {
        alt
        mediaContentType
        status
        ... on MediaImage { id }
      }
      mediaUserErrors { field message }
    }
  }
`;

const PRODUCT_DELETE_MEDIA_MUTATION = `#graphql
  mutation productDeleteMedia($mediaIds: [ID!]!, $productId: ID!) {
    productDeleteMedia(mediaIds: $mediaIds, productId: $productId) {
      deletedMediaIds
      mediaUserErrors { field message }
    }
  }
`;

// Loads the shop's offline session directly from session storage rather than requiring a live
// request's session token — the conversion worker runs in the background (including on boot,
// resuming jobs left over from before a redeploy), well outside any HTTP request lifecycle.
// Never persisted onto a conversion job doc — same reasoning as shopsRepo.js's comment on why it
// doesn't duplicate the access token into a second collection.
async function loadOfflineSession(shopDomain) {
  const session = await shopify.config.sessionStorage.loadSession(`offline_${shopDomain}`);
  if (!session) {
    throw new ShopifyMediaReplaceError(`No offline session found for ${shopDomain} — is the app still installed?`);
  }
  return session;
}

// Adds the converted image as new product media, then (if replaceInPlace) removes the original.
// This is the same "add new, then delete old" two-step Shopify itself requires — there is no
// single "replace this media's file" mutation. Reuses productCreateMedia exactly as
// services/publish.js already does for generated images (passing Cloudinary's public secure_url
// as `originalSource`) instead of the stagedUploadsCreate + PUT dance, which exists for uploading
// raw bytes without a public URL — not needed here since Cloudinary already hosts one.
export async function replaceProductImage({ shopDomain, productId, oldMediaId, newImageUrl, replaceInPlace }) {
  const session = await loadOfflineSession(shopDomain);
  const client = new shopify.api.clients.Graphql({ session });

  const createResponse = await client.request(PRODUCT_CREATE_MEDIA_MUTATION, {
    variables: {
      productId,
      media: [{ originalSource: newImageUrl, mediaContentType: 'IMAGE', alt: 'Optimized by Image Optimizer' }],
    },
  });
  const createErrors = createResponse.data?.productCreateMedia?.mediaUserErrors ?? [];
  if (createErrors.length > 0) {
    throw new ShopifyMediaReplaceError(createErrors.map((error) => error.message).join('; '));
  }
  const newMedia = createResponse.data.productCreateMedia.media[0];

  if (replaceInPlace && oldMediaId) {
    const deleteResponse = await client.request(PRODUCT_DELETE_MEDIA_MUTATION, {
      variables: { productId, mediaIds: [oldMediaId] },
    });
    const deleteErrors = deleteResponse.data?.productDeleteMedia?.mediaUserErrors ?? [];
    if (deleteErrors.length > 0) {
      throw new ShopifyMediaReplaceError(deleteErrors.map((error) => error.message).join('; '));
    }
  }

  return { newMediaId: newMedia?.id ?? null };
}

// The mirror operation for the Conversion History page's "Restore" action: re-adds the original
// (never-deleted — see imageConversion.js/BACKUP_RETENTION_DAYS) Cloudinary asset as product
// media. Only ever adds, never deletes the converted media it's undoing — the merchant may have
// already kept/approved it separately.
export async function restoreProductImage({ shopDomain, productId, originalImageUrl }) {
  const session = await loadOfflineSession(shopDomain);
  const client = new shopify.api.clients.Graphql({ session });

  const response = await client.request(PRODUCT_CREATE_MEDIA_MUTATION, {
    variables: {
      productId,
      media: [{ originalSource: originalImageUrl, mediaContentType: 'IMAGE', alt: 'Restored original image' }],
    },
  });
  const errors = response.data?.productCreateMedia?.mediaUserErrors ?? [];
  if (errors.length > 0) {
    throw new ShopifyMediaReplaceError(errors.map((error) => error.message).join('; '));
  }
}
