import { describe, expect, it, vi } from 'vitest';
import type { BlobDescriptor, EventTemplate, SignedEvent } from 'blossom-client-sdk';
import { deleteBlob } from 'blossom-client-sdk/actions/delete';
import { mediaServer, syncServerList, type MediaServer, type ServerListProgress } from './server';
import * as blossom from './blossom';
import * as nip96 from './nip96';

vi.mock('./blossom', async importOriginal => ({ ...(await importOriginal<typeof blossom>()) }));
vi.mock('./nip96', async importOriginal => ({ ...(await importOriginal<typeof nip96>()) }));
vi.mock('blossom-client-sdk/actions/delete', () => ({ deleteBlob: vi.fn() }));

const sign = async (template: EventTemplate) =>
  ({ ...template, id: '', pubkey: '', sig: '' }) as SignedEvent;

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { response: { status } });

describe('media server error kinds', () => {
  it('rejects with kind not-found when a blossom delete hits a 404', async () => {
    vi.mocked(deleteBlob).mockRejectedValue(httpError(404));
    const server = mediaServer({ type: 'blossom', name: 'x', url: 'https://x.example' });
    await expect(server.delete('h', sign)).rejects.toMatchObject({ kind: 'not-found' });
  });

  it('every blossom method rejects with MediaServerError, never a raw status', async () => {
    const server = mediaServer({ type: 'blossom', name: 'x', url: 'https://x.example' });
    const file = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
    vi.spyOn(blossom, 'fetchBlossomList').mockRejectedValue(httpError(401));
    vi.spyOn(blossom, 'uploadBlossomBlob').mockRejectedValue(httpError(403));
    vi.spyOn(blossom, 'checkBlobExists').mockRejectedValue(httpError(500));
    vi.spyOn(blossom, 'mirrordBlossomBlob').mockRejectedValue(httpError(429));

    await expect(server.list('pk', sign)).rejects.toMatchObject({ kind: 'auth' });
    await expect(server.upload(file, 'x.jpg', sign)).rejects.toMatchObject({ kind: 'auth' });
    await expect(server.mirror('https://src/h', sign)).rejects.toMatchObject({ kind: 'rate_limited' });
  });

  it('scopes delete auth to the server domain (BUD-11)', async () => {
    vi.mocked(deleteBlob).mockResolvedValue(true as never);
    const server = mediaServer({ type: 'blossom', name: 'x', url: 'https://x.example' });
    await server.delete('h', sign);
    const auth = (vi.mocked(deleteBlob).mock.calls[0][2] as { auth: SignedEvent }).auth;
    expect(auth.tags).toContainEqual(['server', 'x.example']);
  });

  it('maps 409 to a conflict kind carrying the status (BUD-04 hash mismatch)', async () => {
    vi.spyOn(blossom, 'mirrordBlossomBlob').mockRejectedValue(httpError(409));
    const server = mediaServer({ type: 'blossom', name: 'x', url: 'https://x.example' });
    await expect(server.mirror('https://src/h', sign)).rejects.toMatchObject({ kind: 'conflict', status: 409 });
  });

  it('carries the status on server errors (502 mirror origin failure)', async () => {
    vi.spyOn(blossom, 'checkBlobExists').mockRejectedValue(httpError(502));
    const server = mediaServer({ type: 'blossom', name: 'x', url: 'https://x.example' });
    await expect(server.exists('h')).rejects.toMatchObject({ kind: 'server', status: 502 });
  });

  it('supports reports on blossom and rejects them as unsupported on nip96', async () => {
    vi.spyOn(blossom, 'reportBlobs').mockResolvedValue();
    const blossomServer = mediaServer({ type: 'blossom', name: 'x', url: 'https://x.example' });
    expect(blossomServer.capabilities.report).toBe(true);
    const event = { id: '1' } as never;
    await expect(blossomServer.report(event)).resolves.toBeUndefined();

    const nip96Server = mediaServer({ type: 'nip96' as const, name: 'x', url: 'https://x.example' });
    expect(nip96Server.capabilities.report).toBe(false);
    await expect(nip96Server.report(event)).rejects.toMatchObject({ kind: 'unsupported' });
  });

  it('every nip96 method rejects with MediaServerError, never a raw status', async () => {
    const source = { type: 'nip96' as const, name: 'x', url: 'https://x.example' };
    const server = mediaServer(source);
    const file = new File(['x'], 'x.jpg', { type: 'image/jpeg' });
    vi.spyOn(nip96, 'fetchNip96List').mockRejectedValue(httpError(500));
    vi.spyOn(nip96, 'uploadNip96File').mockRejectedValue(httpError(404));
    vi.spyOn(nip96, 'deleteNip96File').mockRejectedValue(httpError(410));

    await expect(server.list('pk', sign)).rejects.toMatchObject({ kind: 'server' });
    await expect(server.upload(file, 'x.jpg', sign)).rejects.toMatchObject({ kind: 'not-found' });
    await expect(server.delete('h', sign)).rejects.toMatchObject({ kind: 'not-found' });
    // Absence of a capability is observed, not assumed - and surfaced as a kind.
    await expect(server.exists('h')).rejects.toMatchObject({ kind: 'unsupported' });
  });
});

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
