import { describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import type { BlobDescriptor, EventTemplate } from 'blossom-client-sdk';
import {
  checkBlobExists,
  collectBlossomListPages,
  downloadBlossomBlob,
  extractHashFromUrl,
  fetchBlossomList,
  mirrordBlossomBlob,
  uploadBlossomBlob,
} from './blossom';
import { listBlobs } from 'blossom-client-sdk/actions/list';

vi.mock('blossom-client-sdk/actions/list', () => ({ listBlobs: vi.fn() }));

const sign = async (t: EventTemplate) => ({ ...t, id: '1', sig: 's' }) as never;

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

    const blobs = await collectBlossomListPages(
      async cursor => {
        cursors.push(cursor);
        return pages.get(cursor) ?? [];
      },
      update => {
        progress.push({
          blobs: update.blobs.map(blob => blob.sha256),
          cursor: update.cursor,
          received: update.received,
          state: update.state,
        });
      }
    );

    expect(blobs.map(blob => blob.sha256)).toEqual([hashA, hashB, hashC]);
    expect(cursors).toEqual([undefined, hashB, hashC]);
    expect(progress).toEqual([
      { blobs: [hashA, hashB], cursor: hashB, received: 2, state: 'pending' },
      { blobs: [hashC], cursor: hashC, received: 3, state: 'pending' },
      { blobs: [], received: 3, state: 'complete' },
    ]);
  });
});

describe('BUD-03 hash extraction', () => {
  it('takes the last 64-hex run in a URL, even in deeply nested paths', () => {
    const hash = 'c'.repeat(64);
    expect(extractHashFromUrl(`https://cdn.example/documents/b1/67/${hash}.pdf`)).toBe(hash);
  });

  it('skips the pubkey in NIP-96 media URLs and returns the blob hash', () => {
    const pubkey = 'd'.repeat(64);
    const hash = 'c'.repeat(64);
    expect(extractHashFromUrl(`https://nostrmedia.com/media/${pubkey}/${hash}.png`)).toBe(hash);
  });

  it('still extracts a hash at the root path', () => {
    const hash = 'c'.repeat(64);
    expect(extractHashFromUrl(`https://server.example/${hash}`)).toBe(hash);
  });
});

describe('BUD-02 blob descriptor / headers', () => {
  it('falls back to application/octet-stream when HEAD has no content-type', async () => {
    const hash = 'a'.repeat(64);
    vi.spyOn(axios, 'head').mockResolvedValue({ headers: { 'content-length': '42' } });
    const blob = await checkBlobExists('https://server.example', hash);
    expect(blob?.type).toBe('application/octet-stream');
  });

  it('reads lowercase content-type from a GET download response', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({
      data: new Blob(['x']),
      headers: { 'content-type': 'video/mp4' },
    });
    const result = await downloadBlossomBlob('https://server.example/' + 'a'.repeat(64));
    expect(result.type).toBe('video/mp4');
  });

  it('sends application/octet-stream when the file has no MIME type', async () => {
    const put = vi.spyOn(axios, 'put').mockResolvedValue({ data: { sha256: 'a'.repeat(64), url: 'https://x/u' } });
    const file = new File(['hello'], 'hello');
    await uploadBlossomBlob('https://server.example', file, async t => ({ ...t, id: '1', sig: 's' }) as never);
    const headers = put.mock.calls[0][2]?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/octet-stream');
  });
});

describe('BUD-04 mirror', () => {
  it('throws a real Error when the source URL has no hash', async () => {
    await expect(
      mirrordBlossomBlob('https://target.example', 'https://src.example/not-a-blossom-url', async t => t as never)
    ).rejects.toBeInstanceOf(Error);
  });
});
describe('blob descriptor validation (lenient for old servers)', () => {
  it('drops entries with a malformed sha256 or missing url from list pages', async () => {
    const pages = [
      [
        blob(hashA),
        { ...blob(hashB), sha256: 'not-a-hash' },
        { ...blob(hashC), url: undefined } as unknown as BlobDescriptor,
      ],
      [],
    ];
    const blobs = await collectBlossomListPages(async () => pages.shift() ?? []);
    expect(blobs.map(blob => blob.sha256)).toEqual([hashA]);
  });

  it('keeps descriptors with missing size/type/uploaded (older servers)', async () => {
    const pages = [[{ sha256: hashA, url: `https://media.example/${hashA}` } as BlobDescriptor], []];
    const blobs = await collectBlossomListPages(async () => pages.shift() ?? []);
    expect(blobs).toHaveLength(1);
  });

  it('rejects an upload response that lacks a usable identity', async () => {
    vi.spyOn(axios, 'put').mockResolvedValue({ data: { sha256: 'garbage', url: 'https://x/u' } });
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    await expect(
      uploadBlossomBlob('https://server.example', file, async t => ({ ...t, id: '1', sig: 's' }) as never)
    ).rejects.toThrow(/invalid blob descriptor/i);
  });
});

/** Same shape as the SDK's HTTPError (extends Error, carries `status`), which the
    package does not re-export from its root. */
function httpError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

describe('BUD-02 disabled list endpoint', () => {
  it('treats a 404 /list as an empty list so the server stays usable', async () => {
    vi.mocked(listBlobs).mockRejectedValue(httpError(404, 'List endpoint is disabled on this server'));
    const blobs = await fetchBlossomList('https://server.example', 'p'.repeat(64), sign);
    expect(blobs).toEqual([]);
  });

  it('still rethrows other list failures', async () => {
    vi.mocked(listBlobs).mockRejectedValue(httpError(500, 'boom'));
    await expect(fetchBlossomList('https://server.example', 'p'.repeat(64), sign)).rejects.toMatchObject({
      status: 500,
    });
  });
});

describe('BUD-04 mirror with known sha256', () => {
  it('uses the caller-provided sha256 for the auth x tag even when the URL has no hash', async () => {
    const put = vi.spyOn(axios, 'put').mockResolvedValue({ data: blob(hashA) });
    await mirrordBlossomBlob('https://target.example', 'https://src.example/not-a-blossom-url', sign, undefined, hashA);

    // spyOn returns the existing spy if axios.put is already spied by an earlier
    // test, so pick our call by URL instead of mock.calls[0].
    const mirrorCall = put.mock.calls.find(([url]) => url === 'https://target.example/mirror');
    const headers = mirrorCall?.[2]?.headers as Record<string, string>;
    // encodeAuthorizationHeader emits URL-safe base64 (RFC 4648 §5)
    const b64 = headers['authorization'].replace(/^Nostr /, '').replace(/-/g, '+').replace(/_/g, '/');
    const auth = JSON.parse(atob(b64));
    const xTag = auth.tags.find((tag: string[]) => tag[0] === 'x')?.[1];
    expect(xTag).toBe(hashA);
    expect(mirrorCall?.[1]).toEqual({ url: 'https://src.example/not-a-blossom-url' });
  });
});
