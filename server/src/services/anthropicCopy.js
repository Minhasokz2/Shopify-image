import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// The installed SDK's Model union confirms the real current identifier is "claude-haiku-4-5" —
// the spec refers to this model informally as "Claude 4.5 Haiku". Using the verified id rather
// than a guessed string avoids a 404 against the real Anthropic API.
const MODEL = 'claude-haiku-4-5';
const MAX_PAGE_CHARS = 6000; // just enough signal for palette/tone — not the full page

// Claude has no built-in ability to fetch arbitrary URLs, so the merchant's product pages are
// fetched here and reduced to visible-ish text before being handed to the model — passing bare
// URLs in the prompt would only produce hallucinated results.
async function fetchPageText(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return '';
    const html = await response.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_PAGE_CHARS);
  } catch {
    return '';
  }
}

// Extracts a shop's dominant palette/tone from 3-5 existing product pages (spec Section 3),
// stored as `brandStyleProfile` and injected into every subsequent generation prompt.
export async function extractBrandStyle(productPageUrls) {
  const pages = await Promise.all(productPageUrls.map(async (url) => ({ url, text: await fetchPageText(url) })));
  const pagesBlock = pages
    .map(({ url, text }) => `URL: ${url}\nContent: ${text || '(could not be fetched)'}`)
    .join('\n\n');

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content:
          'Analyze these merchant product pages and infer the brand\'s dominant visual style. ' +
          'Return ONLY JSON of the shape { "palette": ["#hex", ...], "tone": "one sentence description" }.\n\n' +
          pagesBlock,
      },
    ],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock) {
    throw new Error('Anthropic response contained no text content block');
  }

  const parsed = JSON.parse(textBlock.text.replace(/```json|```/g, '').trim());
  return { palette: parsed.palette ?? [], tone: parsed.tone ?? '' };
}
