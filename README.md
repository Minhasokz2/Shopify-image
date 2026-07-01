# VisualKit

AI product photography, UGC-style on-model content, and short product videos for Shopify merchants — generated from a merchant's existing catalog images, with a two-step pipeline (background removal → routed model) that preserves exact product color, logo, label text, shape, and proportions.

## Monorepo layout

This is an npm-workspaces monorepo with four independently runnable projects:

- **`server/`** — Node/Express backend. Shopify OAuth, session-token auth, webhook handling, the two-step generation pipeline, model routing across FAL.ai / OpenAI / Anthropic / WaveSpeed, credit ledger + Shopify billing, Firestore persistence, an in-process job queue, and Resend email.
- **`web/`** — The embedded merchant-facing app: Vite + React + Polaris + Shopify App Bridge.
- **`admin/`** — A separate, non-Shopify-embedded tool for managing the shared template catalog (create/edit/delete templates, assign prompts/models/costs). Gated by `ADMIN_API_KEY`, not a Shopify session — templates aren't scoped per shop, so there's no "shop" to authenticate as here. See "Managing templates" below.
- **`marketing/`** — The public marketing site (Home, Pricing, Features, FAQ, Privacy, Terms, Blog stub). Built here as a subfolder rather than a separate repo because this session's GitHub access is scoped to a single repository; it's structured to be split into its own repo/Cloudflare Pages project later with no code changes.

## Getting started

```bash
npm install                       # installs all three workspaces
cp server/.env.example server/.env
cp web/.env.example web/.env
# fill in real credentials in server/.env (see "Environment variables" below)
npm run dev                       # runs server + web concurrently
```

`server/src/config/env.js` validates all required environment variables at boot with `zod` — the server refuses to start with missing/malformed config rather than failing later at first use.

## Environment variables

See `.env.example` at the repo root for the full list (Shopify credentials, `FAL_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `WAVESPEED_API_KEY`, Firebase service account JSON, Cloudinary credentials, `RESEND_API_KEY`, `SENTRY_DSN`, `ADMIN_API_KEY`). Each workspace also has its own scoped `.env.example`.

## Testing

```bash
npm test
```

Runs Vitest across `server/` (unit tests for the credit ledger, idempotency, the adult-only persona guard, model routing, webhook HMAC verification, session-token validation, and the job worker's concurrency limiting; integration tests against the Express app via `supertest`) and `web/`.

**Known limitation:** this environment has no live API keys for FAL.ai, OpenAI, Anthropic, WaveSpeed, Firebase, Resend, or Sentry, and no real Shopify development store (Cloudinary is the one exception — see below). All tests mock these SDKs at the module boundary. Before shipping, run one manual end-to-end smoke test per content type (scene / UGC / video) and one per billing flow (one-time pack, subscription) against a real dev store and real credentials — this has not been done as part of this build.

## Seeding templates

The app is unusable without the `templates` Firestore collection populated (nothing in the product spec covers this, but every generation job reads its cost/model/prompt from a template record):

```bash
node scripts/seedTemplates.js
```

## Managing templates

Beyond the initial seed, templates are managed through the `admin/` tool rather than by editing Firestore directly:

```bash
npm run dev -w admin      # local dev, served at http://localhost:5174
# or, once built:
npm run build -w admin    # server/src/app.js serves the build at /admin
```

Sign in with `ADMIN_API_KEY` (set in `server/.env`). The catalog is shared across every merchant shop, so create/edit/delete here takes effect for all of them immediately — there is no per-shop template customization. The `preferredModel` allowed for a template is constrained by its `category` (scene → FLUX/Imagen, ugc → GPT Image 2, video → Seedance/Kling/Wan) — the admin UI only offers valid combinations, and the server rejects an invalid one regardless.

## Firestore indexes

See `scripts/createFirestoreIndexes.md` for the composite indexes the job history and batch views require.

## Deployment

- `server/` → Render (Node web service).
- `web/` → built by Vite, served by `server/` in production (or as a static asset behind the same domain — see `server/src/app.js`).
- `admin/` → also built by Vite and served by `server/` in production, at `/admin` — no separate hosting needed.
- `marketing/` → Cloudflare Pages, pointed at the `marketing/` subfolder's build output.

## Architecture notes

- **Two-step pipeline**: background removal (`fal-ai/birefnet`) always runs before scene/persona/video generation for static scenes and UGC content; video jobs starting from an already-processed product image reuse the clean image.
- **Model routing** (`server/src/services/modelRouter.js`): color-critical categories (skincare/cosmetics/makeup/beauty) route static scenes to Imagen 4; all UGC/lifestyle content routes to GPT Image 2; video routes per-template to Seedance 2.0 Fast / Kling 3.0 / Wan 2.7.
- **Adult-only persona guard** (`server/src/services/personaGuard.js`): a hard, server-side-only allowlist check (`ageRange === "adult"` exactly) that runs before any UGC model API call and before a job is allowed to leave `pending` status. This is a non-negotiable trust-and-safety requirement, not a configurable setting.
- **Credits**: cost is always re-read from the template record server-side and deducted only when a job succeeds — never pre-deducted, never trusted from the client.
- **Idempotency**: every job-creating and publish action is guarded by a Firestore-transaction idempotency-key claim so retries never double-charge or double-publish.
- **Job queue**: no Redis/BullMQ in this deployment target — a single in-process, concurrency-limited worker (`server/src/services/jobWorker.js`) backed by Firestore as the durable record, with resume-on-boot for crash/redeploy recovery. This assumes a single Render instance; horizontal scaling would require revisiting this design.
