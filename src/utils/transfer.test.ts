import { describe, expect, it, vi } from 'vitest';
import type { BlobDescriptor } from 'blossom-client-sdk';
import * as blossom from './blossom';
import { transferBlob } from './transfer';
import type { Server } from './useUserServers';

vi.mock('./blossom', async importOriginal => ({ ...(await importOriginal<typeof blossom>()) }));

const sign = async () => ({ id: '', pubkey: '', created_at: 0, kind: 0, tags: [], content: '', sig: '' }) as never;

const target: Server = { type: 'blossom', name: 'target', url: 'https://target.example' };
const descriptor = (sha256: string): BlobDescriptor => ({
  sha256,
  url: `https://target.example/${sha256}`,
  type: 'image/jpeg',
  size: 1,
  uploaded: 1,
});

describe('transferBlob mirror fallback', () => {
  it('falls back to download-and-upload when the server does not support mirroring, and says so', async () => {
    const httpError = Object.assign(new Error('HTTP 405'), { response: { status: 405 } });
    vi.spyOn(blossom, 'mirrordBlossomBlob').mockRejectedValue(httpError);
    vi.spyOn(blossom, 'downloadBlossomBlob').mockResolvedValue({
      data: new Blob(['x']),
      type: 'image/jpeg',
    } as never);
    vi.spyOn(blossom, 'uploadBlossomBlob').mockResolvedValue(descriptor('a'.repeat(64)));
    const onMirrorUnsupported = vi.fn();

    const result = await transferBlob('https://source.example/' + 'a'.repeat(64), target, sign, {
      allowMirror: true,
      onMirrorUnsupported,
    });

    expect(onMirrorUnsupported).toHaveBeenCalledOnce();
    expect(result.url).toContain('target.example');
    expect(vi.mocked(blossom.uploadBlossomBlob)).toHaveBeenCalled();
  });

  it.each([409, 502])('falls back to download-and-upload when mirror fails with %i (BUD-04)', async status => {
    vi.spyOn(blossom, 'mirrordBlossomBlob').mockRejectedValue(
      Object.assign(new Error(`HTTP ${status}`), { response: { status } })
    );
    vi.spyOn(blossom, 'downloadBlossomBlob').mockResolvedValue({
      data: new Blob(['x']),
      type: 'image/jpeg',
    } as never);
    vi.spyOn(blossom, 'uploadBlossomBlob').mockResolvedValue(descriptor('a'.repeat(64)));
    const onMirrorUnsupported = vi.fn();

    const result = await transferBlob('https://source.example/' + 'a'.repeat(64), target, sign, {
      allowMirror: true,
      onMirrorUnsupported,
    });

    expect(onMirrorUnsupported).toHaveBeenCalledOnce();
    expect(result.url).toContain('target.example');
    expect(vi.mocked(blossom.uploadBlossomBlob)).toHaveBeenCalled();
  });
});
