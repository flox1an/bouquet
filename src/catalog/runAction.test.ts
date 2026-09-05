import { describe, expect, it } from 'vitest';
import type { BlobDescriptor } from 'blossom-client-sdk';
import type { NostrEvent } from 'nostr-tools';
import { MediaServerError } from '../utils/server';
import { Catalog, MemoryCatalogStore } from './catalog';
import { executeDeleteRun, executeTransferRun, planActionRun } from './runAction';

const pubkey = 'p'.repeat(64);
const hashA = 'a'.repeat(64);

function blob(sha256: string): BlobDescriptor {
  return { sha256, url: `https://media.example/${sha256}`, type: 'image/jpeg', size: 42, uploaded: 1 };
}

function event(id: string, createdAt: number, tags: string[][], kind = 1063): NostrEvent {
  return { id, pubkey, kind, created_at: createdAt, tags, content: '', sig: 'sig' } as NostrEvent;
}

async function catalogWithAssetOnBothServers() {
  const catalog = new Catalog(new MemoryCatalogStore());
  await catalog.ingestServerList(pubkey, {
    server: { url: 'https://one.example', type: 'blossom' },
    blobs: [blob(hashA)],
    state: 'complete',
  });
  await catalog.ingestServerList(pubkey, {
    server: { url: 'https://two.example', type: 'blossom' },
    blobs: [blob(hashA)],
    state: 'complete',
  });
  await catalog.ingestAuthoredEvents(pubkey, [event('e1', 100, [['x', hashA]])], 'wss://relay.example');
  await catalog.queryCatalogTimeline(pubkey);
  const [item] = await catalog.queryCatalogTimeline(pubkey);
  return { catalog, item };
}

describe('action run', () => {
  it('plans a delete run covering every (file, server) pair that holds the media', async () => {
    const { catalog, item } = await catalogWithAssetOnBothServers();

    const plan = await planActionRun(catalog, {
      pubkey,
      action: 'delete',
      assets: [{ assetId: item.assetId, title: 'Sunset' }],
    });

    expect(plan.blocked).toEqual([]);
    expect(plan.targetHashes).toEqual([hashA]);
    expect(plan.deleteTasks.map(task => `${task.hash}:${task.serverId}`).sort()).toEqual([
      `${hashA}:https://one.example`,
      `${hashA}:https://two.example`,
    ]);
  });
  it('blocks assets with no transferable copy and reports the reason', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    await catalog.ingestAuthoredEvents(pubkey, [event('e2', 100, [['x', hashA]])], 'wss://relay.example');
    await catalog.queryCatalogTimeline(pubkey);
    const [item] = await catalog.queryCatalogTimeline(pubkey);

    const plan = await planActionRun(catalog, {
      pubkey,
      action: 'mirror',
      assets: [{ assetId: item.assetId, title: 'Orphan' }],
    });

    expect(plan.allowed).toEqual([]);
    expect(plan.blocked).toEqual([{ assetId: item.assetId, title: 'Orphan', reason: expect.any(String) }]);
    expect(plan.ops).toEqual([]);
  });

  it('plans mirror ops only for the gaps on the chosen destination', async () => {
    const { catalog, item } = await catalogWithAssetOnBothServers();
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://three.example', type: 'blossom' },
      state: 'complete',
    });

    const plan = await planActionRun(catalog, {
      pubkey,
      action: 'mirror',
      assets: [{ assetId: item.assetId, title: 'Sunset' }],
      destinationUrl: 'https://three.example',
    });

    expect(plan.allowed).toHaveLength(1);
    expect(plan.ops).toEqual([
      expect.objectContaining({
        sha256: hashA,
        sourceBaseUrl: 'https://one.example',
        targetServerId: 'https://three.example',
        targetBaseUrl: 'https://three.example',
      }),
    ]);
  });
  it('executes a delete run: 404 counts as already gone, removals land in the catalog', async () => {
    const { catalog, item } = await catalogWithAssetOnBothServers();
    const plan = await planActionRun(catalog, {
      pubkey,
      action: 'delete',
      assets: [{ assetId: item.assetId, title: 'Sunset' }],
    });
    const finalState = new Map<string, string>();
    const deletedFrom: string[] = [];

    const result = await executeDeleteRun(plan, {
      catalog,
      pubkey,
      mediaServerFor: task => ({
        delete: async () => {
          deletedFrom.push(task.serverId);
          if (task.serverId === 'https://two.example') throw new MediaServerError('not-found', 'gone');
        },
      }),
      onRow: row => finalState.set(row.key, row.state),
    });

    expect(deletedFrom.sort()).toEqual(['https://one.example', 'https://two.example']);
    expect(result.allSucceeded).toBe(true);
    expect(result.cancelled).toBe(false);
    expect(result.removed).toEqual(
      expect.arrayContaining([
        { sha256: hashA, serverUrl: 'https://one.example' },
        { sha256: hashA, serverUrl: 'https://two.example', reason: 'not found on server' },
      ])
    );
    expect([...finalState.values()].sort()).toEqual(['done', 'not_found']);
    // The catalog agrees: no replica sources survive on either server.
    const map = await catalog.getAssetReplicaMap(pubkey, item.assetId);
    expect(map.flatMap(replica => replica.sources)).toEqual([]);
  });

  it('marks a delete run failed when a server refuses, and the catalog keeps the replica', async () => {
    const { catalog, item } = await catalogWithAssetOnBothServers();
    const plan = await planActionRun(catalog, {
      pubkey,
      action: 'delete',
      assets: [{ assetId: item.assetId, title: 'Sunset' }],
    });

    const result = await executeDeleteRun(plan, {
      catalog,
      pubkey,
      mediaServerFor: task =>
        task.serverId === 'https://one.example'
          ? {
              delete: async () => {
                throw new MediaServerError('auth', 'no');
              },
            }
          : { delete: async () => undefined },
    });

    expect(result.allSucceeded).toBe(false);
    const map = await catalog.getAssetReplicaMap(pubkey, item.assetId);
    expect(map.flatMap(replica => replica.sources).map(source => source.serverId)).toEqual(['https://one.example']);
  });
  it('executes a transfer run: the new replica is ingested and probed', async () => {
    const { catalog, item } = await catalogWithAssetOnBothServers();
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://three.example', type: 'blossom' },
      state: 'complete',
    });
    const plan = await planActionRun(catalog, {
      pubkey,
      action: 'mirror',
      assets: [{ assetId: item.assetId, title: 'Sunset' }],
      destinationUrl: 'https://three.example',
    });
    const result = await executeTransferRun(plan, {
      catalog,
      pubkey,
      transfer: async op => ({
        sha256: op.sha256,
        url: `${op.targetBaseUrl}/${op.sha256}`,
        size: 1,
        type: 'image/jpeg',
        uploaded: 1,
      }),
      serverFor: op => ({ url: op.targetBaseUrl, type: 'blossom' as const }),
      probe: async () => ({ status: 200 }),
    });

    expect(result.allSucceeded).toBe(true);
    expect(result.cancelled).toBe(false);
    expect(result.transferredHashes).toEqual([hashA]);
    const map = await catalog.getAssetReplicaMap(pubkey, item.assetId);
    expect(map.flatMap(replica => replica.sources).map(source => source.serverId)).toContain('https://three.example');
  });

  it('cancels a transfer run cleanly; blobs already across stay recorded', async () => {
    const { catalog, item } = await catalogWithAssetOnBothServers();
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://three.example', type: 'blossom' },
      state: 'complete',
    });
    const plan = await planActionRun(catalog, {
      pubkey,
      action: 'sync',
      assets: [{ assetId: item.assetId, title: 'Sunset' }],
    });
    const controller = new AbortController();
    controller.abort();
    const result = await executeTransferRun(plan, {
      catalog,
      pubkey,
      signal: controller.signal,
      transfer: async op => ({
        sha256: op.sha256,
        url: `${op.targetBaseUrl}/${op.sha256}`,
        size: 1,
        type: 'image/jpeg',
        uploaded: 1,
      }),
      serverFor: op => ({ url: op.targetBaseUrl, type: 'blossom' as const }),
      probe: async () => ({ status: 200 }),
    });

    expect(result.cancelled).toBe(true);
    expect(result.transferredHashes).toEqual([]);
  });
});
