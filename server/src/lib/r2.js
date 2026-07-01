import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';

// Cloudflare R2 is S3-API-compatible — point the standard S3Client at R2's account endpoint.
export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY,
    secretAccessKey: env.CLOUDFLARE_R2_SECRET_KEY,
  },
});

const UPLOAD_URL_TTL_SECONDS = 15 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 60 * 60;

// Large image/video binaries go direct-to-R2 from the browser or from a model provider's
// callback rather than proxying through this Node process.
export async function createPresignedUploadUrl(key, { contentType } = {}) {
  const command = new PutObjectCommand({
    Bucket: env.CLOUDFLARE_R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(r2Client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
  return { url, key, publicUrl: publicUrlFor(key) };
}

export async function createPresignedDownloadUrl(key) {
  const command = new GetObjectCommand({ Bucket: env.CLOUDFLARE_R2_BUCKET, Key: key });
  return getSignedUrl(r2Client, command, { expiresIn: DOWNLOAD_URL_TTL_SECONDS });
}

export function publicUrlFor(key) {
  if (env.CLOUDFLARE_R2_PUBLIC_URL) {
    return `${env.CLOUDFLARE_R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
  }
  return null;
}

// Generated media comes back from FAL.ai/OpenAI as short-lived provider-hosted URLs — this
// downloads and re-uploads it to R2 (the spec's 30-day-TTL store of record) so job history and
// publish-to-Shopify don't depend on a third party's URL staying alive.
export async function persistMediaToR2(sourceUrl, key) {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to download generated media for R2 persistence: HTTP ${response.status}`);
  }
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const body = Buffer.from(await response.arrayBuffer());

  await r2Client.send(
    new PutObjectCommand({
      Bucket: env.CLOUDFLARE_R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  return publicUrlFor(key) ?? createPresignedDownloadUrl(key);
}
