import { describe, it, expect } from 'vitest';
import { signState, verifyState, InvalidStateError } from '../../src/lib/signedState.js';

describe('signedState', () => {
  it('round-trips a payload signed and verified with the same key', () => {
    const token = signState({ shop: 'shop-a.myshopify.com' });
    const payload = verifyState(token);
    expect(payload.shop).toBe('shop-a.myshopify.com');
  });

  it('rejects a tampered payload', () => {
    const token = signState({ shop: 'shop-a.myshopify.com' });
    const [body, signature] = token.split('.');
    const tamperedBody = Buffer.from(JSON.stringify({ shop: 'attacker.myshopify.com', exp: Date.now() + 60_000 })).toString(
      'base64url',
    );
    expect(() => verifyState(`${tamperedBody}.${signature}`)).toThrow(InvalidStateError);
    void body;
  });

  it('rejects a malformed token', () => {
    expect(() => verifyState('not-a-valid-token')).toThrow(InvalidStateError);
  });

  it('rejects an expired token', () => {
    const token = signState({ shop: 'shop-a.myshopify.com' }, -1000);
    expect(() => verifyState(token)).toThrow(InvalidStateError);
  });
});
