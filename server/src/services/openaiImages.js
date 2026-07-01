import OpenAI, { toFile } from 'openai';
import { env } from '../config/env.js';
import { assertAdultPersona } from './personaGuard.js';

const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

async function fetchAsUploadable(imageUrl) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to download product image for UGC generation: HTTP ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') || 'image/png';
  return toFile(buffer, 'product.png', { type: contentType });
}

// UGC/on-model route for every lifestyle template (spec Section 8) — always GPT Image 2.
// Uses the SDK's image-conditioned `images.edit` rather than `images.generate`: this call
// composites the already-background-removed product image (`cleanImageUrl`) onto a generated
// persona/scene, and OpenAI's generations endpoint has no reference-image input to do that.
export async function generateUGC({ cleanImageUrl, promptTemplate, personaSettings, brandStyleProfile }) {
  // Hard guard, enforced again here (not just at the route layer) so this function can never be
  // called with a non-adult persona from any future call site.
  assertAdultPersona(personaSettings);

  const stylePrefix = brandStyleProfile
    ? `Match brand visual style: palette ${brandStyleProfile.palette.join(', ')}, tone ${brandStyleProfile.tone}. `
    : '';
  const prompt = `${stylePrefix}Adult model, ${personaSettings.genderPresentation}, ${personaSettings.setting}. ${promptTemplate}`;

  const image = await fetchAsUploadable(cleanImageUrl);
  const response = await client.images.edit({
    model: 'gpt-image-2',
    image,
    prompt,
    n: 4,
  });

  return response.data.map((img) => img.url ?? `data:image/png;base64,${img.b64_json}`);
}
