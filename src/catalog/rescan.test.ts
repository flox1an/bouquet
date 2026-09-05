import { describe, expect, it } from 'vitest';
import type { BlobDescriptor } from 'blossom-client-sdk';
import { Catalog, MemoryCatalogStore } from './catalog';
import { rescanCatalog } from './rescan';

const pubkey = 'p'.repeat(64);
const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);

function blob(sha256: string): BlobDescriptor {
  return { sha256, url: `https://one.example/${sha256}`, type: 'image/jpeg', size: 42, uploaded: 1 };
}

const servers = [{ url: 'https://one.example', type: 'blossom' as const, name: 'one' }];

describe('rescan', () => {
  it('rebuilds the catalog so a shrunken listing removes presence (ADR-0006)', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://one.example', type: 'blossom' },
      blobs: [blob(hashA), blob(hashB)],
      state: 'complete',
      full: true,
    });
    await catalog.ingestAuthoredEvents(
      pubkey,
      [
        { id: 'eA', pubkey, kind: 1063, created_at: 100, tags: [['x', hashA]], content: '', sig: 'sig' },
        { id: 'eB', pubkey, kind: 1063, created_at: 101, tags: [['x', hashB]], content: '', sig: 'sig' },
      ] as never[],
      'wss://relay.example'
    );
    await catalog.queryCatalogTimeline(pubkey);

    const report = await rescanCatalog(catalog, {
      pubkey,
      servers,
      list: async () => [blob(hashA)], // hashB was deleted on the server since
    });

    expect(report).toEqual([{ serverId: 'https://one.example', received: 1, state: 'complete' }]);
    const timeline = await catalog.queryCatalogTimeline(pubkey);
    const byHash = new Map(timeline.map(item => [item.primaryBlobSha256, item]));
    expect(byHash.get(hashA)).toMatchObject({ replicaCount: 1, availabilityState: 'complete' });
    // Fully-removed blobs are purged with their evidence, so hashB may drop out entirely.
    expect(byHash.get(hashB)?.replicaCount ?? 0).toBe(0);
  });

  it('resets before fetching, so the rebuild starts from a clean catalog', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    const calls: string[] = [];
    const store = Catalog.storeFor(catalog);
    const originalReset = store.reset.bind(store);
    store.reset = async () => {
      calls.push('reset');
      await originalReset();
    };

    await rescanCatalog(catalog, {
      pubkey,
      servers,
      list: async () => {
        calls.push('list');
        return [];
      },
    });

    expect(calls[0]).toBe('reset');
  });
});
