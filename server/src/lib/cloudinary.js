import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env.js';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

// Generated media comes back from FAL.ai/OpenAI as short-lived provider-hosted URLs — this
// re-uploads it to Cloudinary (the store of record) so job history and publish-to-Shopify don't
// depend on a third party's URL staying alive. Cloudinary fetches directly from `sourceUrl`
// server-side, so this app never has to download/buffer the bytes itself.
export async function persistMediaToCloudinary(sourceUrl, publicId) {
  const result = await cloudinary.uploader.upload(sourceUrl, {
    public_id: publicId,
    resource_type: 'auto', // picks image vs video automatically
    overwrite: true, // a retried job re-uploading the same index should replace, not 409
  });
  return result.secure_url;
}

export { cloudinary };
