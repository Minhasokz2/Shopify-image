import { describe, it, expect, vi, beforeEach } from 'vitest';

const getToken = vi.fn();
const verifyIdToken = vi.fn();

vi.mock('google-auth-library', () => ({
  OAuth2Client: class {
    getToken(...args) {
      return getToken(...args);
    }
    verifyIdToken(...args) {
      return verifyIdToken(...args);
    }
    generateAuthUrl() {
      return 'https://accounts.google.com/mock';
    }
  },
}));

const { verifyGoogleAuthCode, GoogleAuthError } = await import('../../src/services/googleAuth.js');

function payloadFor(email, sub, name = null) {
  return { getPayload: () => ({ email, email_verified: true, sub, name }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('verifyGoogleAuthCode', () => {
  it('exchanges a fresh code and returns the verified identity', async () => {
    getToken.mockResolvedValue({ tokens: { id_token: 'idtok-1' } });
    verifyIdToken.mockResolvedValue(payloadFor('a@example.com', 'g-1', 'A'));

    const result = await verifyGoogleAuthCode('code-1');

    expect(result).toEqual({ email: 'a@example.com', googleId: 'g-1', name: 'A' });
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  // Google authorization codes are single-use — exchanging the same one twice always fails the
  // second call with invalid_grant. /auth/google/callback has been observed receiving a
  // near-duplicate request for the same code a fraction of a second after the first, so two
  // concurrent calls for the same code must share one exchange rather than racing Google.
  it('shares a single in-flight exchange between concurrent calls for the same code', async () => {
    let resolveToken;
    getToken.mockReturnValue(
      new Promise((resolve) => {
        resolveToken = resolve;
      }),
    );
    verifyIdToken.mockResolvedValue(payloadFor('b@example.com', 'g-2'));

    const first = verifyGoogleAuthCode('code-2');
    const second = verifyGoogleAuthCode('code-2');
    resolveToken({ tokens: { id_token: 'idtok-2' } });

    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toEqual(secondResult);
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it('replays the settled result for a duplicate request shortly after the first resolves', async () => {
    getToken.mockResolvedValue({ tokens: { id_token: 'idtok-3' } });
    verifyIdToken.mockResolvedValue(payloadFor('c@example.com', 'g-3'));

    const first = await verifyGoogleAuthCode('code-3');
    const second = await verifyGoogleAuthCode('code-3');

    expect(second).toEqual(first);
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it('does not memoize failures forever — a different code still gets its own exchange', async () => {
    getToken.mockResolvedValueOnce({ tokens: { id_token: 'idtok-4' } });
    verifyIdToken.mockResolvedValueOnce({ getPayload: () => ({ email: null, email_verified: false }) });

    await expect(verifyGoogleAuthCode('code-4')).rejects.toThrow(GoogleAuthError);

    getToken.mockResolvedValueOnce({ tokens: { id_token: 'idtok-5' } });
    verifyIdToken.mockResolvedValueOnce(payloadFor('d@example.com', 'g-5'));

    const result = await verifyGoogleAuthCode('code-5');
    expect(result).toEqual({ email: 'd@example.com', googleId: 'g-5', name: null });
    expect(getToken).toHaveBeenCalledTimes(2);
  });
});
