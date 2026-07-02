import { describe, it, expect } from 'vitest';
import { Timestamp } from '../../src/lib/firestore.js';
import { serializeTimestamps } from '../../src/lib/serializeTimestamps.js';

describe('serializeTimestamps', () => {
  it('converts a Firestore Timestamp to an ISO string the client can pass to new Date()', () => {
    const timestamp = Timestamp.fromDate(new Date('2026-07-02T12:00:00.000Z'));
    expect(serializeTimestamps(timestamp)).toBe('2026-07-02T12:00:00.000Z');
  });

  it('recurses into nested objects and arrays', () => {
    const timestamp = Timestamp.fromDate(new Date('2026-07-02T12:00:00.000Z'));
    const input = { jobs: [{ id: 'job-1', createdAt: timestamp, nested: { updatedAt: timestamp } }] };

    expect(serializeTimestamps(input)).toEqual({
      jobs: [{ id: 'job-1', createdAt: '2026-07-02T12:00:00.000Z', nested: { updatedAt: '2026-07-02T12:00:00.000Z' } }],
    });
  });

  it('leaves primitives, null, and non-Timestamp objects untouched', () => {
    expect(serializeTimestamps('scene')).toBe('scene');
    expect(serializeTimestamps(42)).toBe(42);
    expect(serializeTimestamps(null)).toBeNull();
    expect(serializeTimestamps({ status: 'succeeded', creditsCharged: 3 })).toEqual({
      status: 'succeeded',
      creditsCharged: 3,
    });
  });
});
