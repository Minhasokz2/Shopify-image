import { describe, it, expect, afterEach, vi } from 'vitest';

// Node's native fetch (undici) isn't reliably intercepted by nock in the installed version —
// verified directly: an earlier nock-based draft of this test silently fell through to the real
// network and got a real 401 from the real api.wavespeed.ai. Stubbing global fetch is the
// correct, dependency-free way to control HTTP responses here.
const { generateVideo, WaveSpeedApiError } = await import('../../src/services/wavespeed.js');

function jsonResponse(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('wavespeed.generateVideo', () => {
  it('submits the correct request shape and returns the completed output', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockImplementationOnce(async (url, options) => {
      expect(url).toBe('https://api.wavespeed.ai/api/v3/kwaivgi/kling-v3/image-to-video');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({
        image: 'https://r2.example.com/clean.png',
        prompt: 'cinematic pan',
        aspect_ratio: '16:9',
        duration: 5,
      });
      return jsonResponse(200, { id: 'task-1' });
    });
    fetchMock.mockImplementationOnce(async (url) => {
      expect(url).toBe('https://api.wavespeed.ai/api/v3/predictions/task-1/result');
      return jsonResponse(200, { status: 'completed', outputs: ['https://wavespeed.example.com/out.mp4'] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateVideo({
      model: 'kling-3',
      cleanImageUrl: 'https://r2.example.com/clean.png',
      motionPrompt: 'cinematic pan',
      aspectRatio: '16:9',
    });

    expect(result).toBe('https://wavespeed.example.com/out.mp4');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('polls until the task completes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: 'task-2' }))
      .mockResolvedValueOnce(jsonResponse(200, { status: 'processing' }))
      .mockResolvedValueOnce(jsonResponse(200, { status: 'completed', outputs: ['https://wavespeed.example.com/out2.mp4'] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateVideo({
      model: 'wan-2.7',
      cleanImageUrl: 'https://r2.example.com/clean.png',
      motionPrompt: 'restyle',
      aspectRatio: '1:1',
    });

    expect(result).toBe('https://wavespeed.example.com/out2.mp4');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws WaveSpeedApiError with the status code on a 4xx/5xx submission response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(500, { error: 'boom' })));

    await expect(
      generateVideo({ model: 'kling-3', cleanImageUrl: 'x', motionPrompt: 'x', aspectRatio: '1:1' }),
    ).rejects.toMatchObject({ name: 'WaveSpeedApiError', statusCode: 500 });
  });

  it('throws WaveSpeedApiError when the provider reports the task failed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: 'task-3' }))
      .mockResolvedValueOnce(jsonResponse(200, { status: 'failed', error: 'model overloaded' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateVideo({ model: 'kling-3', cleanImageUrl: 'x', motionPrompt: 'x', aspectRatio: '1:1' }),
    ).rejects.toMatchObject({ name: 'WaveSpeedApiError', message: 'model overloaded' });
  });

  it('rejects video models with no WaveSpeed route without making a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateVideo({ model: 'seedance-fast', cleanImageUrl: 'x', motionPrompt: 'x', aspectRatio: '1:1' }),
    ).rejects.toThrow('WaveSpeed has no route for video model: seedance-fast');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
