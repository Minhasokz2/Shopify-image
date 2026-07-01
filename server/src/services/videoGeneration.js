import { generateVideo as generateVideoViaFal } from './fal.js';
import { generateVideo as generateVideoViaWaveSpeed } from './wavespeed.js';

// Kling 3.0 and Wan 2.7 have a second route through WaveSpeed; Seedance is FAL-only.
const WAVESPEED_FALLBACK_MODELS = new Set(['kling-3', 'wan-2.7']);

// Every external AI call gets one retry on a fallback provider before the job is marked failed
// (spec Section 13). FAL.ai is always tried first; on failure, Kling/Wan retry once through
// WaveSpeed's direct route for the same model tier.
export async function generateVideoWithFallback(params) {
  try {
    return await generateVideoViaFal(params);
  } catch (primaryError) {
    if (!WAVESPEED_FALLBACK_MODELS.has(params.model)) {
      throw primaryError;
    }
    try {
      return await generateVideoViaWaveSpeed(params);
    } catch (fallbackError) {
      throw new AggregateError(
        [primaryError, fallbackError],
        `Video generation failed on both FAL.ai and the WaveSpeed fallback for model "${params.model}"`,
      );
    }
  }
}
