import { describe, expect, it } from 'vitest';
import type { BlobDescriptor } from 'blossom-client-sdk';
import type { NostrEvent } from 'nostr-tools';
import { Catalog, MemoryCatalogStore } from './catalog';

const pubkey = 'p'.repeat(64);
const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const hashC = 'c'.repeat(64);

function blob(sha256: string): BlobDescriptor {
  return { sha256, url: `https://media.example/${sha256}`, type: 'image/jpeg', size: 42, uploaded: 1 };
}

function event(id: string, createdAt: number, tags: string[][], content = ''): NostrEvent {
  return { id, pubkey, kind: 1063, created_at: createdAt, tags, content, sig: 'sig' } as NostrEvent;
}

describe('user blob catalog', () => {
  it('persists one membership with separate direct evidence for duplicate server-list hashes', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    await catalog.ingestServerList(pubkey, { server: { url: 'https://one.example/', type: 'blossom' }, blobs: [blob(hashA)], state: 'complete' });
    await catalog.ingestServerList(pubkey, { server: { url: 'https://two.example', type: 'nip96' }, blobs: [blob(hashA)], state: 'complete' });

    const status = await catalog.getCatalogStatus(pubkey);
    expect(status.knownHashes).toBe(1);
    expect(status.directSeeds).toBe(2);
    expect(status.serverLists).toEqual(expect.arrayContaining([
      expect.objectContaining({ serverId: 'https://one.example', state: 'complete' }),
      expect.objectContaining({ serverId: 'https://two.example', state: 'complete' }),
    ]));
  });

  it('retains failed server-list progress without treating it as complete', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://interrupted.example', type: 'blossom' },
      blobs: [blob(hashA)],
      cursor: 'page-2',
      state: 'failed',
      error: 'connection reset',
    });

    const status = await catalog.getCatalogStatus(pubkey);
    expect(status.knownHashes).toBe(1);
    expect(status.serverLists).toEqual([
      expect.objectContaining({ state: 'failed', cursor: 'page-2', error: 'connection reset', received: 1 }),
    ]);
  });

  it('caches event provenance, extracts direct and derived hashes, and does not duplicate a reprojection', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    const metadata = event('event-1', 100, [
      ['x', hashA],
      ['imeta', `x ${hashB}`, `image https://media.example/${hashC}`],
    ], `again https://media.example/${hashC}`);

    await catalog.ingestAuthoredEvents(pubkey, [metadata], 'wss://relay.example');
    await catalog.reprojectEvents(pubkey);

    const status = await catalog.getCatalogStatus(pubkey);
    expect(status.knownHashes).toBe(3);
    expect(status.directSeeds).toBe(2);
    expect(status.derivedSeeds).toBe(2);
  });

  it('continues event pagination beyond a page and deduplicates an unchanged sync', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    const events = Array.from({ length: 501 }, (_, index) => event(`event-${index}`, 1_000 - index, [['x', index % 2 === 0 ? hashA : hashB]]));
    const pages: Array<{ until?: number; limit: number }> = [];
    const loadPage = async ({ until, limit }: { until?: number; limit: number }) => {
      pages.push({ until, limit });
      return events.filter(item => until === undefined || item.created_at <= until).slice(0, limit);
    };

    await catalog.syncAuthoredEvents(pubkey, 'wss://relay.example', loadPage);
    await catalog.syncAuthoredEvents(pubkey, 'wss://relay.example', loadPage);

    const status = await catalog.getCatalogStatus(pubkey);
    expect(pages.some(page => page.until === 500)).toBe(true);
    expect(status.knownHashes).toBe(2);
    expect(status.relaySyncs).toEqual([expect.objectContaining({ state: 'complete', received: 501 })]);
  });

  it('limits reverse lookup expansion to media companions with a persisted root evidence chain', async () => {
    const store = new MemoryCatalogStore();
    const catalog = new Catalog(store);
    await catalog.ingestServerList(pubkey, { server: { url: 'https://seed.example', type: 'blossom' }, blobs: [blob(hashA)], state: 'complete' });
    let requests = 0;
    await catalog.syncReverseLookups(pubkey, 'wss://relay.example', async hashes => {
      requests += 1;
      expect(hashes).toEqual([hashA]);
      return [event('reverse-event', 100, [['x', hashA], ['thumb', `https://media.example/${hashB}`], ['url', `https://media.example/${hashC}`]])];
    });
    await catalog.syncReverseLookups(pubkey, 'wss://relay.example', async hashes => {
      requests += 1;
      expect(hashes).toEqual([hashB]);
      return [];
    });

    const status = await catalog.getCatalogStatus(pubkey);
    expect(requests).toBe(2);
    expect(status.knownHashes).toBe(2);
    expect(status.derivedSeeds).toBe(1);
  });

  it('persists bounded HLS descendants and prefix metadata facts', async () => {
    const store = new MemoryCatalogStore();
    const catalog = new Catalog(store);
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://cdn.example', type: 'blossom' },
      blobs: [{ ...blob(hashA), url: 'https://cdn.example/master.m3u8', type: 'application/vnd.apple.mpegurl' }],
      state: 'complete',
    });
    await catalog.enrichHls(pubkey, hashA, async url => {
      if (url.endsWith('master.m3u8')) return '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nvariant.m3u8';
      return `#EXTM3U\n#EXTINF:4,\nhttps://cdn.example/${hashB}.ts`;
    });
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47], 0);
    new DataView(png.buffer).setUint32(16, 640);
    await catalog.ingestId3(hashC, { title: 'Track', artist: 'Artist' });
    new DataView(png.buffer).setUint32(20, 480);
    await catalog.enrichBlobPrefix(hashC, `https://cdn.example/${hashC}.png`, async () => ({ bytes: png.buffer, size: 24, truncated: false }));

    const relationships = await store.getAll<{ type: string }>('blob_relationship');
    const facts = await store.getAll<{ field: string; value: number | string }>('metadata_fact');
    expect(relationships).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'playlist' }), expect.objectContaining({ type: 'segment' })]));
    expect(facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'width', value: 640 }),
      expect.objectContaining({ field: 'height', value: 480 }),
      expect.objectContaining({ field: 'title', value: 'Track' }),
    ]));
    expect((await catalog.getCatalogStatus(pubkey)).knownHashes).toBe(2);
  });
});
