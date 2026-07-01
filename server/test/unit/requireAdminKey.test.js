import { describe, it, expect, vi } from 'vitest';

const { requireAdminKey } = await import('../../src/middleware/requireAdminKey.js');
const { env } = await import('../../src/config/env.js');

function makeReq(headerValue) {
  return { get: (name) => (name.toLowerCase() === 'x-admin-key' ? headerValue : undefined) };
}

function makeRes() {
  const res = { statusCode: 200 };
  res.status = vi.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = vi.fn((body) => {
    res.body = body;
    return res;
  });
  return res;
}

describe('requireAdminKey', () => {
  it('calls next() for the correct key', () => {
    const req = makeReq(env.ADMIN_API_KEY);
    const res = makeRes();
    const next = vi.fn();

    requireAdminKey(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects with 401 when the header is missing', () => {
    const req = makeReq(undefined);
    const res = makeRes();
    const next = vi.fn();

    requireAdminKey(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rejects with 401 for a wrong key of the same length', () => {
    const wrongSameLength = 'x'.repeat(env.ADMIN_API_KEY.length);
    const req = makeReq(wrongSameLength);
    const res = makeRes();
    const next = vi.fn();

    requireAdminKey(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rejects with 401 for a wrong key of a different length', () => {
    const req = makeReq('short');
    const res = makeRes();
    const next = vi.fn();

    requireAdminKey(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
