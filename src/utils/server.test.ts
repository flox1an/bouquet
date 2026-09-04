import { describe, expect, it } from 'vitest';
import type { BlobDescriptor } from 'blossom-client-sdk';
import type { MediaServer, ServerListProgress } from './server';
import { syncServerList } from './server';

const blob = (sha256: string): BlobDescriptor => ({
  sha256,
  url: `https://media.example/${sha256}`,
  type: 'image/jpeg',
  size: 1,
  uploaded: 1,
});

describe('syncServerList', () => {
  it('ingests pages incrementally and marks only the final list authoritative', async () => {
    const first = blob('a'.repeat(64));
    const second = blob('b'.repeat(64));
    const fake: Pick<MediaServer, 'list' | 'source'> = {
      source: { type: 'nip96', name: 'media.example', url: 'https://media.example' },
      list: async (_pubkey, _sign, onProgress) => {
        await onProgress?.({ blobs: [first], cursor: '0', received: 1, state: 'pending' });
        await onProgress?.({ blobs: [second], cursor: '1', received: 2, state: 'pending' });
        return [first, second];
      },
    };
    const ingested: Array<ServerListProgress & { full?: boolean }> = [];

    await syncServerList(fake, 'pubkey', async () => ({ id: '', pubkey: '', created_at: 0, kind: 0, tags: [], content: '', sig: '' }), update => {
      ingested.push(update);
    });

    expect(ingested).toEqual([
      { blobs: [first], cursor: '0', received: 1, state: 'pending' },
      { blobs: [second], cursor: '1', received: 2, state: 'pending' },
      { blobs: [first, second], received: 2, state: 'complete', full: true },
    ]);
  });
});
