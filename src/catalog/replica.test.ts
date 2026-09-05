import { describe, expect, it } from 'vitest';
import { listingClaimMayRestore, nextCheckAtFrom, stateFromHttpStatus } from './replica';

describe('replica presence law', () => {
  it('maps an HTTP status to a replica state', () => {
    expect(stateFromHttpStatus(200)).toBe('present');
    expect(stateFromHttpStatus(299)).toBe('present');
    expect(stateFromHttpStatus(404)).toBe('absent');
    expect(stateFromHttpStatus(410)).toBe('absent');
    expect(stateFromHttpStatus(401)).toBe('unauthorized');
    expect(stateFromHttpStatus(403)).toBe('unauthorized');
    expect(stateFromHttpStatus(429)).toBe('rate_limited');
    expect(stateFromHttpStatus(500)).toBe('unreachable');
    expect(stateFromHttpStatus(599)).toBe('unreachable');
  });

  it('backs off exponentially on failures and resets a day out when present', () => {
    const hour = 60 * 60_000;
    const day = 24 * hour;
    const now = 1_000_000;
    expect(nextCheckAtFrom(now, 'present', 0)).toBe(now + day);
    expect(nextCheckAtFrom(now, 'absent', 1)).toBe(now + 2 * hour);
    expect(nextCheckAtFrom(now, 'absent', 2)).toBe(now + 4 * hour);
    expect(nextCheckAtFrom(now, 'absent', 3)).toBe(now + 8 * hour);
    expect(nextCheckAtFrom(now, 'absent', 9)).toBe(now + day);
  });

  it('never lets a listing claim resurrect a probe-observed absence (ADR-0006)', () => {
    expect(listingClaimMayRestore(undefined)).toBe(true);
    expect(listingClaimMayRestore('present')).toBe(true);
    expect(listingClaimMayRestore('unreachable')).toBe(true);
    expect(listingClaimMayRestore('absent')).toBe(false);
  });
});
