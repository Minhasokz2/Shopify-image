import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Single source of truth for every environment variable this app reads. Validated once at
// import time so the process fails fast at boot instead of failing later, mid-request, at
// first use of a missing credential.
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  SHOPIFY_API_KEY: z.string().min(1),
  SHOPIFY_API_SECRET: z.string().min(1),
  SHOPIFY_APP_URL: z.string().url(),
  SHOPIFY_SCOPES: z
    .string()
    .min(1)
    .default('read_products,write_products,read_product_listings')
    .transform((value) => value.split(',').map((scope) => scope.trim()).filter(Boolean)),

  FAL_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  WAVESPEED_API_KEY: z.string().min(1),

  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().min(1),

  CLOUDFLARE_R2_ACCESS_KEY: z.string().min(1),
  CLOUDFLARE_R2_SECRET_KEY: z.string().min(1),
  CLOUDFLARE_R2_BUCKET: z.string().min(1),
  CLOUDFLARE_R2_ACCOUNT_ID: z.string().min(1),
  CLOUDFLARE_R2_PUBLIC_URL: z.string().url().optional(),

  RESEND_API_KEY: z.string().min(1),
  SENTRY_DSN: z.string().optional(),

  // Gates the platform-admin template-management surface (/admin/api/*) — separate from every
  // Shopify shop's session token, since the template catalog is shared across all shops, not
  // scoped to one. Not a merchant-facing credential.
  ADMIN_API_KEY: z.string().min(16, 'ADMIN_API_KEY must be at least 16 characters'),
});

function loadEnv() {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid environment configuration:', result.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration — see errors above.');
  }
  return result.data;
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
