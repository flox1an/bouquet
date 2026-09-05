import { describe, expect, it } from 'vitest';
import { formatTransferError } from './upload';

describe('formatTransferError', () => {
  it('preserves the transfer page messages for source and server failures', () => {
    expect(formatTransferError({ name: 'SourceBlobNotFoundError' }, 'origin')).toBe('Missing on source server (origin)');
    expect(formatTransferError({ response: { status: 503 } }, 'origin')).toBe('Server error (503)');
  });
});
