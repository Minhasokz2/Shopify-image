import { env } from '../config/env.js';

// No official WaveSpeed SDK exists on npm (verified against the registry at plan time) — this
// is a small hand-rolled fetch client, deliberately shaped like fal.js's generateVideo() so
// videoGeneration.js can treat the two providers polymorphically as primary/fallback.
const BASE_URL = 'https://api.wavespeed.ai/api/v3';
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 60; // ~2 minutes

// Kling 3.0 and Wan 2.7 are the two tiers this app also reaches via WaveSpeed as a fallback
// provider when the primary FAL.ai call fails (spec Section 13: "one retry on a cheaper
// fallback model before marking a job failed"). Seedance has no WaveSpeed route.
const MODEL_PATHS = {
  'kling-3': 'kwaivgi/kling-v3/image-to-video',
  'wan-2.7': 'wavespeed-ai/wan-2.7/image-to-video',
};

export class WaveSpeedApiError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'WaveSpeedApiError';
    this.statusCode = statusCode;
  }
}

async function submitTask(modelPath, payload) {
  const response = await fetch(`${BASE_URL}/${modelPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WAVESPEED_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new WaveSpeedApiError(`WaveSpeed task submission failed: ${response.status}`, response.status);
  }
  const body = await response.json();
  return body.id;
}

async function pollTask(taskId) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${BASE_URL}/predictions/${taskId}/result`, {
      headers: { Authorization: `Bearer ${env.WAVESPEED_API_KEY}` },
    });
    if (!response.ok) {
      throw new WaveSpeedApiError(`WaveSpeed status check failed: ${response.status}`, response.status);
    }
    const body = await response.json();
    if (body.status === 'completed') return body.outputs?.[0];
    if (body.status === 'failed') {
      throw new WaveSpeedApiError(body.error || 'WaveSpeed task failed', 502);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new WaveSpeedApiError('WaveSpeed task timed out waiting for a result', 504);
}

export async function generateVideo({ model, cleanImageUrl, motionPrompt, aspectRatio }) {
  const modelPath = MODEL_PATHS[model];
  if (!modelPath) {
    throw new Error(`WaveSpeed has no route for video model: ${model}`);
  }
  const taskId = await submitTask(modelPath, {
    image: cleanImageUrl,
    prompt: motionPrompt,
    aspect_ratio: aspectRatio,
    duration: 5,
  });
  return pollTask(taskId);
}
