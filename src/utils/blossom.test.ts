import { describe, expect, it } from 'vitest';
import type { BlobDescriptor } from 'blossom-client-sdk';
import { collectBlossomListPages } from './blossom';

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const hashC = 'c'.repeat(64);

function blob(sha256: string): BlobDescriptor {
  return { sha256, url: `https://media.example/${sha256}`, type: 'image/jpeg', size: 42, uploaded: 1 };
}

describe('Blossom list pagination', () => {
  it('continues with the final SHA-256 cursor even after a short page', async () => {
    const pages = new Map<string | undefined, BlobDescriptor[]>([
      [undefined, [blob(hashA), blob(hashB)]],
      [hashB, [blob(hashC)]],
      [hashC, []],
    ]);
    const cursors: Array<string | undefined> = [];
    const progress: Array<{ blobs: string[]; cursor?: string; received: number; state: string }> = [];

    const blobs = await collectBlossomListPages(async cursor => {
      cursors.push(cursor);
      return pages.get(cursor) ?? [];
    }, update => {
      progress.push({ blobs: update.blobs.map(blob => blob.sha256), cursor: update.cursor, received: update.received, state: update.state });
    });

    expect(blobs.map(blob => blob.sha256)).toEqual([hashA, hashB, hashC]);
    expect(cursors).toEqual([undefined, hashB, hashC]);
    expect(progress).toEqual([
      { blobs: [hashA, hashB], cursor: hashB, received: 2, state: 'pending' },
      { blobs: [hashC], cursor: hashC, received: 3, state: 'pending' },
      { blobs: [], received: 3, state: 'complete' },
    ]);
  });
});
