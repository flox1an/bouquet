import axios from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { uploadBlossomBlob } from './blossom';
import { formatTransferError } from './upload';

describe('uploadBlossomBlob', () => {
  it('sends the X-SHA-256 header required by BUD-01 and hashes the file once', async () => {
    const hash = 'a'.repeat(64);
    const put = vi.spyOn(axios, 'put').mockResolvedValue({ data: { sha256: hash, url: 'https://x/u' } });
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    await uploadBlossomBlob(
      'https://server.example',
      file,
      async template => ({ ...template, id: '1', sig: 's' }) as never
    );
    const headers = put.mock.calls[0][2]?.headers as Record<string, string>;
    expect(headers['X-SHA-256']).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
    expect(headers.authorization).toContain('Nostr');
  });
});

describe('formatTransferError', () => {
  it('preserves the transfer page messages for source and server failures', () => {
    expect(formatTransferError({ name: 'SourceBlobNotFoundError' }, 'origin')).toBe(
      'Missing on source server (origin)'
    );
    expect(formatTransferError({ response: { status: 503 } }, 'origin')).toBe('Server error (503)');
  });
});
