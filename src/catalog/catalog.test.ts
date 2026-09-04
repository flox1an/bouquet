import { describe, expect, it } from 'vitest';
import type { BlobDescriptor } from 'blossom-client-sdk';
import type { NostrEvent } from 'nostr-tools';
import { Catalog, MemoryCatalogStore } from './catalog';
import { eventKindLabel, fallbackEventTitle } from './eventKinds';
import { extractTimelineEventMetadata } from './timelineMetadata';
import {
  buildReplicaOps,
  getAssetReplicaMap,
  getCatalogTimelineAsset,
  isHashSearchTerm,
  planCatalogAction,
  projectCatalogAssets,
  queryCatalogAssetIds,
  queryCatalogTimeline,
  refreshReplicaAvailability,
  refreshEventUrlAvailability,
  splitSearchTerms,
} from './advanced';

const pubkey = 'p'.repeat(64);
const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const hashC = 'c'.repeat(64);
const hashD = 'd'.repeat(64);

function blob(sha256: string): BlobDescriptor {
  return { sha256, url: `https://media.example/${sha256}`, type: 'image/jpeg', size: 42, uploaded: 1 };
}

function event(id: string, createdAt: number, tags: string[][], content = '', kind = 1063): NostrEvent {
  return { id, pubkey, kind, created_at: createdAt, tags, content, sig: 'sig' } as NostrEvent;
}

describe('user blob catalog', () => {
  it('labels event kinds and creates humane fallback titles', () => {
    expect(eventKindLabel(1)).toBe('Note');
    expect(eventKindLabel(20)).toBe('Picture');
    expect(eventKindLabel(1063)).toBe('File');
    expect(eventKindLabel(undefined)).toBe('Unlinked file');
    expect(eventKindLabel(999)).toBe('Kind 999');
    expect(fallbackEventTitle(1)).toBe('Untitled note');
    expect(fallbackEventTitle(20)).toBe('Untitled picture');
    expect(fallbackEventTitle(undefined)).toBe('Unlinked file');
    expect(fallbackEventTitle(999)).toBe('Untitled kind 999');
  });

  it('marks event titles as fallback only when title and usable content are absent', () => {
    const titled = extractTimelineEventMetadata(event('titled', 1, [['title', 'A title']]));
    const bare = extractTimelineEventMetadata(event('bare', 1, [], '', 20));

    expect(titled).toMatchObject({ title: 'A title', titleIsFallback: false });
    expect(bare).toMatchObject({ title: 'Untitled picture', titleIsFallback: true });
    expect(bare.title.startsWith('Nostr event')).toBe(false);
  });
  it('projects v1 file events and current nsite manifests', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    const manifests = [
      event(
        'nsite-v1-file',
        99,
        [
          ['d', '/index.html'],
          ['x', hashA],
        ],
        '',
        34128
      ),
      event(
        'blossom-drive',
        100,
        [
          ['path', '/index.html', hashA],
          ['x', hashD, 'aggregate'],
        ],
        '',
        30563
      ),
      event(
        'root-nsite',
        101,
        [
          ['path', '/index.html', hashB],
          ['x', hashD, 'aggregate'],
        ],
        '',
        15128
      ),
      event(
        'named-nsite',
        102,
        [
          ['d', 'site'],
          ['path', '/index.html', hashC],
          ['x', hashD, 'aggregate'],
        ],
        '',
        35128
      ),
      event(
        'snapshot-nsite',
        103,
        [
          ['path', '/index.html', hashD],
          ['x', hashA, 'aggregate'],
        ],
        '',
        5128
      ),
    ];

    await catalog.ingestAuthoredEvents(pubkey, manifests, 'wss://relay.example');
    await projectCatalogAssets(catalog, pubkey, { force: true });

    expect(await queryCatalogTimeline(catalog, pubkey, { types: ['document'] })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventId: 'nsite-v1-file', primaryBlobSha256: hashA }),
        expect.objectContaining({ eventId: 'blossom-drive', primaryBlobSha256: hashA }),
        expect.objectContaining({ eventId: 'root-nsite', primaryBlobSha256: hashB }),
        expect.objectContaining({ eventId: 'named-nsite', primaryBlobSha256: hashC }),
        expect.objectContaining({ eventId: 'snapshot-nsite', primaryBlobSha256: hashD }),
      ])
    );
  });

  it('persists one membership with separate direct evidence for duplicate server-list hashes', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://one.example/', type: 'blossom' },
      blobs: [blob(hashA)],
      state: 'complete',
    });
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://two.example', type: 'nip96' },
      blobs: [blob(hashA)],
      state: 'complete',
    });

    const status = await catalog.getCatalogStatus(pubkey);
    expect(status.knownHashes).toBe(1);
    expect(status.directSeeds).toBe(2);
    expect(status.serverLists).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ serverId: 'https://one.example', state: 'complete' }),
        expect.objectContaining({ serverId: 'https://two.example', state: 'complete' }),
      ])
    );
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
    const metadata = event(
      'event-1',
      100,
      [
        ['x', hashA],
        ['imeta', `x ${hashB}`, `image https://media.example/${hashC}`],
      ],
      `again https://media.example/${hashC}`
    );

    await catalog.ingestAuthoredEvents(pubkey, [metadata], 'wss://relay.example');
    await catalog.reprojectEvents(pubkey);

    const status = await catalog.getCatalogStatus(pubkey);
    expect(status.knownHashes).toBe(3);
    expect(status.directSeeds).toBe(2);
    expect(status.derivedSeeds).toBe(2);
  });

  it('continues event pagination beyond a page and deduplicates an unchanged sync', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    const events = Array.from({ length: 501 }, (_, index) =>
      event(`event-${index}`, 1_000 - index, [['x', index % 2 === 0 ? hashA : hashB]])
    );
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
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://seed.example', type: 'blossom' },
      blobs: [blob(hashA)],
      state: 'complete',
    });
    let requests = 0;
    await catalog.syncReverseLookups(pubkey, 'wss://relay.example', async hashes => {
      requests += 1;
      expect(hashes).toEqual([hashA]);
      return [
        event('reverse-event', 100, [
          ['x', hashA],
          ['thumb', `https://media.example/${hashB}`],
          ['url', `https://media.example/${hashC}`],
        ]),
      ];
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

  it('matches reverse lookup events via url tags, not only x tags', async () => {
    const store = new MemoryCatalogStore();
    const catalog = new Catalog(store);
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://seed.example', type: 'blossom' },
      blobs: [blob(hashA)],
      state: 'complete',
    });
    let requests = 0;
    await catalog.syncReverseLookups(pubkey, 'wss://relay.example', async hashes => {
      requests += 1;
      expect(hashes).toEqual([hashA]);
      return [
        event('reverse-url-event', 100, [
          ['url', `https://seed.example/${hashA}`],
          ['thumb', `https://media.example/${hashB}`],
        ]),
      ];
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

  it('extracts references from generic tags and content URLs on known servers', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://media.example', type: 'blossom' },
      blobs: [blob(hashA)],
      state: 'complete',
    });
    await catalog.ingestAuthoredEvents(
      pubkey,
      [event('generic-event', 100, [['r', `https://media.example/${hashB}`]], `see https://media.example/${hashC}`)],
      'wss://relay.example'
    );

    const status = await catalog.getCatalogStatus(pubkey);
    expect(status.knownHashes).toBe(3);
    expect(status.derivedSeeds).toBe(2);
  });

  it('persists bounded HLS descendants and prefix metadata facts', async () => {
    const store = new MemoryCatalogStore();
    const catalog = new Catalog(store);
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://cdn.example', type: 'blossom' },
      blobs: [{ ...blob(hashA), url: 'https://cdn.example/master.txt', type: 'text/plain' }],
      state: 'complete',
    });
    await catalog.enrichHls(pubkey, hashA, async url => {
      if (url.endsWith('master.txt')) return '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nvariant.m3u8';
      return `#EXTM3U\n#EXTINF:4,\nhttps://cdn.example/${hashB}.ts`;
    });
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47], 0);
    new DataView(png.buffer).setUint32(16, 640);
    await catalog.ingestId3(hashC, { title: 'Track', artist: 'Artist' });
    new DataView(png.buffer).setUint32(20, 480);
    await catalog.enrichBlobPrefix(pubkey, hashC, `https://cdn.example/${hashC}.png`, async () => ({
      bytes: png.buffer,
      size: 24,
      truncated: false,
    }));

    const relationships = await store.getAll<{ type: string }>('blob_relationship');
    const facts = await store.getAll<{ field: string; value: number | string }>('metadata_fact');
    expect(relationships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'playlist' }),
        expect.objectContaining({ type: 'segment' }),
      ])
    );
    expect(facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'width', value: 640 }),
        expect.objectContaining({ field: 'height', value: 480 }),
        expect.objectContaining({ field: 'title', value: 'Track' }),
      ])
    );
    expect((await catalog.getCatalogStatus(pubkey)).knownHashes).toBe(2);
    const playlistBlob = await store.get<{ sha256: string; firstSeenAt: number; verifiedMimeType?: string }>(
      'blob',
      hashA
    );
    await store.put('blob', { ...playlistBlob!, verifiedMimeType: 'text/plain' });
    await projectCatalogAssets(catalog, pubkey);
    expect(await queryCatalogTimeline(catalog, pubkey)).toEqual([
      expect.objectContaining({ displayType: 'video', primaryBlobSha256: hashA, blobCount: 2 }),
    ]);
  });
  it('re-expands a playlist wedged behind a zero-descendant expansion', async () => {
    const store = new MemoryCatalogStore();
    const catalog = new Catalog(store);
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://cdn.example', type: 'blossom' },
      blobs: [{ ...blob(hashA), url: 'https://cdn.example/master.txt', type: 'text/plain' }],
      state: 'complete',
    });
    // Identification sniffed the bytes and proved a playlist; the record itself
    // stays generic, which is how a `.txt` playlist is typed once server and HEAD
    // evidence are all a catalog has beside the sniff payload.
    const prefix = new TextEncoder().encode('#EXTM3U\n#EXTINF:4,\n');
    await catalog.enrichBlobPrefix(pubkey, hashA, 'https://cdn.example/master.txt', async () => ({
      bytes: prefix.buffer,
      mimeType: 'text/plain',
      size: prefix.byteLength,
      truncated: false,
    }));
    await store.put('blob', { ...(await store.get('blob', hashA))!, verifiedMimeType: 'text/plain' });
    // One transient error page answered 200, and the expansion recorded itself done.
    await catalog.enrichHls(pubkey, hashA, async () => '<html>502 gateway</html>');

    // The sniff payload still proves the playlist, and the poisoned result no
    // longer vetoes a retry: the sweep offers the hash and expansion actually runs.
    expect(await catalog.queryPlaylistHashes()).toContain(hashA);
    await catalog.enrichHls(pubkey, hashA, async url => {
      if (url.endsWith('master.txt')) return `#EXTM3U\n#EXTINF:4,\nhttps://cdn.example/${hashB}.ts`;
      return '#EXTM3U\n';
    });
    expect(await store.getAll('blob_relationship')).toEqual(
      expect.arrayContaining([expect.objectContaining({ fromSha256: hashA, toSha256: hashB, type: 'segment' })])
    );
    const result = await store.get<{ state: string; payload?: string }>('extractor_result', `${hashA}:hls:2`);
    expect(result?.state).toBe('complete');
    expect(JSON.parse(result?.payload ?? '{}').descendants).toBeGreaterThan(0);
  });
  it('replaces a standalone blob projection when an event references that blob', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://media.example', type: 'blossom' },
      blobs: [blob(hashA)],
      state: 'complete',
    });
    await projectCatalogAssets(catalog, pubkey);
    expect(await queryCatalogTimeline(catalog, pubkey)).toEqual([
      expect.objectContaining({ assetId: `${pubkey}:root-blob:${hashA}`, primaryBlobSha256: hashA }),
    ]);

    await catalog.ingestAuthoredEvents(
      pubkey,
      [event('first-referencing-event', 100, [['x', hashA]]), event('second-referencing-event', 200, [['x', hashA]])],
      'wss://relay.example'
    );
    await projectCatalogAssets(catalog, pubkey, { force: true });

    const timeline = await queryCatalogTimeline(catalog, pubkey);
    expect(timeline).toHaveLength(2);
    expect(timeline.map(item => item.eventId)).toEqual(['second-referencing-event', 'first-referencing-event']);
    expect(timeline).toEqual(
      expect.not.arrayContaining([expect.objectContaining({ assetId: `${pubkey}:root-blob:${hashA}` })])
    );
  });

  it('records meaningful replica transitions, projects assets, and plans safe actions', async () => {
    const store = new MemoryCatalogStore();
    const catalog = new Catalog(store);
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://replica.example', type: 'blossom' },
      blobs: [blob(hashA)],
      state: 'complete',
    });
    await refreshReplicaAvailability(catalog, pubkey, async () => ({ status: 200, size: 42, mimeType: 'image/jpeg' }));
    await refreshReplicaAvailability(catalog, pubkey, async () => ({ status: 200, size: 42, mimeType: 'image/jpeg' }));
    await refreshReplicaAvailability(catalog, pubkey, async () => ({ status: 404 }));

    const history = await store.getAll<{ newState: string }>('blob_location_history');
    // Presence is already known from the server list itself, so the first probe
    // confirms a state that was never `absent`/unknown - no transition to log.
    expect(history.map(item => item.newState)).toEqual(['absent']);

    await catalog.ingestAuthoredEvents(pubkey, [event('asset-event', 100, [['x', hashA]])], 'wss://relay.example');
    await projectCatalogAssets(catalog, pubkey);
    const timeline = await queryCatalogTimeline(catalog, pubkey);
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ primaryBlobSha256: hashA, displayDate: 100_000 });
    await refreshReplicaAvailability(catalog, pubkey, async () => ({ status: 200 }));
    expect(await planCatalogAction(catalog, pubkey, timeline[0].assetId, 'mirror')).toMatchObject({
      allowed: true,
      targets: [hashA],
    });
    expect(await planCatalogAction(catalog, pubkey, timeline[0].assetId, 'delete')).toMatchObject({
      allowed: true,
      targets: [hashA],
    });
  });
  it('makes server-listed blobs visible to the server filter without a replica probe', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://almond.slidetr.net', type: 'blossom' },
      blobs: [blob(hashA), blob(hashB)],
      state: 'complete',
    });
    await catalog.ingestAuthoredEvents(
      pubkey,
      [event('asset-a', 100, [['x', hashA]]), event('asset-b', 200, [['x', hashB]])],
      'wss://relay.example'
    );
    await projectCatalogAssets(catalog, pubkey, { force: true });

    const assetIds = await queryCatalogAssetIds(catalog, { serverId: 'https://almond.slidetr.net' });
    expect(assetIds).toHaveLength(2);
    const timeline = await queryCatalogTimeline(catalog, pubkey, { serverId: 'https://almond.slidetr.net' });
    expect(timeline).toHaveLength(2);
  });
  it('removes a server from the filter and replica count once a delete confirms it is gone', async () => {
    const store = new MemoryCatalogStore();
    const catalog = new Catalog(store);
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
    await catalog.ingestAuthoredEvents(pubkey, [event('asset-a', 100, [['x', hashA]])], 'wss://relay.example');
    await projectCatalogAssets(catalog, pubkey, { force: true });
    expect(await queryCatalogAssetIds(catalog, { serverId: 'https://one.example' })).toHaveLength(1);
    const beforeDelete = await queryCatalogTimeline(catalog, pubkey);
    expect(beforeDelete[0]).toMatchObject({ replicaCount: 2 });

    await catalog.recordBlobsRemoved(pubkey, [{ sha256: hashA, serverUrl: 'https://one.example' }]);

    // Gone from the deleted server's filter, still present on the other one.
    expect(await queryCatalogAssetIds(catalog, { serverId: 'https://one.example' })).toHaveLength(0);
    expect(await queryCatalogAssetIds(catalog, { serverId: 'https://two.example' })).toHaveLength(1);
    await projectCatalogAssets(catalog, pubkey, { force: true });
    const afterDelete = await queryCatalogTimeline(catalog, pubkey);
    expect(afterDelete[0]).toMatchObject({ replicaCount: 1, availabilityState: 'complete' });
    // Still present on two.example, so the blob stays in the catalog.
    expect(await store.get('blob', hashA)).toBeDefined();

    // Deleting on the last remaining server drops it to unavailable, not "unknown" -
    // the catalog has direct evidence it is gone everywhere, not merely unchecked.
    await catalog.recordBlobsRemoved(pubkey, [{ sha256: hashA, serverUrl: 'https://two.example' }]);
    await projectCatalogAssets(catalog, pubkey, { force: true });
    const afterBothDeleted = await queryCatalogTimeline(catalog, pubkey);
    expect(afterBothDeleted[0]).toMatchObject({ replicaCount: 0, availabilityState: 'unavailable' });
    // Gone from every known server: the blob itself leaves the catalog - identity
    // and enrichment rows go, while the membership keeps the event asset rendering
    // as unavailable and the locations keep proving it is absent, not unchecked.
    expect(await store.get('blob', hashA)).toBeUndefined();
    expect(await store.getAllFromIndex('blob_url', 'by_sha256', hashA)).toHaveLength(0);
    expect(await store.getAll('profile_blob_evidence')).toHaveLength(0);
    expect(await store.getAll('profile_blob_membership')).toHaveLength(1);
    expect(await store.getAllFromIndex('blob_location', 'by_sha256', hashA)).toHaveLength(2);

    const history = await store.getAll<{
      sha256: string;
      serverId: string;
      previousState?: string;
      newState: string;
      reason?: string;
    }>('blob_location_history');
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sha256: hashA,
          serverId: 'https://one.example',
          previousState: 'present',
          newState: 'absent',
        }),
        expect.objectContaining({
          sha256: hashA,
          serverId: 'https://two.example',
          previousState: 'present',
          newState: 'absent',
        }),
      ])
    );
  });
  it('drops the timeline card of an unpublished blob deleted from its last server', async () => {
    const store = new MemoryCatalogStore();
    const catalog = new Catalog(store);
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://one.example', type: 'blossom' },
      blobs: [blob(hashA)],
      state: 'complete',
    });
    await projectCatalogAssets(catalog, pubkey, { force: true });
    expect(await queryCatalogTimeline(catalog, pubkey)).toHaveLength(1);

    await catalog.recordBlobsRemoved(pubkey, [{ sha256: hashA, serverUrl: 'https://one.example' }]);
    expect(await store.get('blob', hashA)).toBeUndefined();

    // No event references the hash, so with the blob row gone nothing anchors a
    // card for it anymore: the run stamp retires the root-blob projection.
    await projectCatalogAssets(catalog, pubkey, { force: true });
    expect(await queryCatalogTimeline(catalog, pubkey)).toHaveLength(0);
  });
  it('removing a file directly on the server drops it from the filter once the full list is rescanned', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://one.example', type: 'blossom' },
      blobs: [blob(hashA), blob(hashB)],
      state: 'complete',
      full: true,
    });
    await catalog.ingestAuthoredEvents(
      pubkey,
      [event('asset-a', 100, [['x', hashA]]), event('asset-b', 100, [['x', hashB]])],
      'wss://relay.example'
    );
    await projectCatalogAssets(catalog, pubkey, { force: true });
    expect(await queryCatalogAssetIds(catalog, { serverId: 'https://one.example' })).toHaveLength(2);

    // hashB was deleted outside the app - the next full rescan no longer sees it.
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://one.example', type: 'blossom' },
      blobs: [blob(hashA)],
      state: 'complete',
      full: true,
    });
    await projectCatalogAssets(catalog, pubkey, { force: true });

    const assetIds = await queryCatalogAssetIds(catalog, { serverId: 'https://one.example' });
    expect(assetIds).toHaveLength(1);
    expect(assetIds[0]).toBe(`${pubkey}:immutable-event:asset-a`);
  });
  it('a listing cannot resurrect presence that a probe observed gone', async () => {
    const store = new MemoryCatalogStore();
    const catalog = new Catalog(store);
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://one.example', type: 'blossom' },
      blobs: [blob(hashA)],
      state: 'complete',
      full: true,
    });
    await refreshReplicaAvailability(catalog, pubkey, async () => ({ status: 404 }));

    // A Primal-style stale listing still carries the deleted blob; the re-claim
    // must not overwrite the probe's absence.
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://one.example', type: 'blossom' },
      blobs: [blob(hashA)],
      state: 'complete',
      full: true,
    });

    const locations = await store.getAllFromIndex<{ state: string }>('blob_location', 'by_sha256', hashA);
    expect(locations.map(location => location.state)).toEqual(['absent']);
    await projectCatalogAssets(catalog, pubkey, { force: true });
    expect((await queryCatalogTimeline(catalog, pubkey))[0]).toMatchObject({
      availabilityState: 'unavailable',
      replicaCount: 0,
    });
  });
  it('resets to an empty catalog and rebuilds from the listings on rescan', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    const listing = {
      server: { url: 'https://one.example', type: 'blossom' as const },
      blobs: [blob(hashA)],
      state: 'complete' as const,
      full: true,
    };
    await catalog.ingestServerList(pubkey, listing);
    expect((await catalog.getCatalogStatus(pubkey)).knownHashes).toBe(1);

    await catalog.reset();
    const wiped = await catalog.getCatalogStatus(pubkey);
    expect(wiped.knownHashes).toBe(0);
    expect(wiped.serverLists).toEqual([]);
    expect(await catalog.queryPlaylistHashes()).toEqual([]);

    // The rescan re-ingests the same listing; the wiped catalog accepts it whole.
    await catalog.ingestServerList(pubkey, listing);
    expect((await catalog.getCatalogStatus(pubkey)).knownHashes).toBe(1);
  });

  it('stores additional pubkeys per account and preserves them across catalog rescans', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    await catalog.addAdditionalPubkey(hashA, {
      pubkey: hashB,
      relayHints: ['wss://one.example', 'wss://one.example'],
    });

    await catalog.reset();
    expect(await catalog.listAdditionalPubkeys(hashA)).toEqual([
      expect.objectContaining({ pubkey: hashB, relayHints: ['wss://one.example'] }),
    ]);
    expect(await catalog.listAdditionalPubkeys(hashC)).toEqual([]);

    await catalog.removeAdditionalPubkey(hashA, hashB);
    expect(await catalog.listAdditionalPubkeys(hashA)).toEqual([]);
  });

  it('imports a selected pubkey as read-only content with its Blossom source', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    await catalog.addAdditionalPubkey(hashA, { pubkey: hashB, relayHints: [] });
    const website = {
      ...event('external-site', 100, [['d', '/index.html'], ['x', hashC]], '', 34128),
      pubkey: hashB,
    };
    const unrelated = { ...event('unrelated', 100, [['x', hashD]]), pubkey: hashD };

    await catalog.syncAdditionalEvents(
      hashA,
      hashB,
      'wss://relay.example',
      async () => [website, unrelated],
      ['https://files.example/']
    );
    await projectCatalogAssets(catalog, hashA, { force: true });

    const imported = (await queryCatalogTimeline(catalog, hashA)).find(
      item => item.eventId === 'external-site'
    );
    expect(imported).toMatchObject({
      eventAuthor: hashB,
      primaryBlobSha256: hashC,
      primaryUrl: `https://files.example/${hashC}`,
    });

    await catalog.ingestServerList(hashA, {
      server: { url: 'https://owned.example', type: 'blossom' },
      blobs: [blob(hashC)],
      state: 'complete',
      full: true,
    });
    await catalog.removeAdditionalPubkey(hashA, hashB);
    await projectCatalogAssets(catalog, hashA, { force: true });
    const remaining = await queryCatalogTimeline(catalog, hashA);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ primaryBlobSha256: hashC });
    expect(remaining[0].eventId).toBeUndefined();
  });

  it('marks a directly referenced native URL as available without treating it as a transferable replica', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    const nativeUrl = `https://native.example/${hashA}.mp4`;
    await catalog.ingestAuthoredEvents(
      pubkey,
      [event('native-url-event', 100, [], nativeUrl, 1)],
      'wss://relay.example'
    );
    await projectCatalogAssets(catalog, pubkey, { force: true });
    const timeline = await queryCatalogTimeline(catalog, pubkey);
    const asset = timeline.find(item => item.eventId === 'native-url-event');
    if (!asset) throw new Error('Native URL event projection was not created');

    await refreshEventUrlAvailability(catalog, pubkey, async url => {
      expect(url).toBe(nativeUrl);
      return { status: 200, size: 42, mimeType: 'video/mp4' };
    });
    await projectCatalogAssets(catalog, pubkey, { force: true });

    expect((await queryCatalogTimeline(catalog, pubkey)).find(item => item.assetId === asset.assetId)).toMatchObject({
      availabilityState: 'complete',
      primaryUrl: nativeUrl,
      replicaCount: 0,
    });
    expect(await planCatalogAction(catalog, pubkey, asset.assetId, 'mirror')).toMatchObject({
      allowed: false,
      reason: 'No server currently has a copy that can be transferred',
      targets: [hashA],
    });
  });
  it('re-extracts legacy content references to retain their native URLs', async () => {
    const store = new MemoryCatalogStore();
    const catalog = new Catalog(store);
    const nativeUrl = `https://native.example/${hashA}.mp4`;
    await catalog.ingestAuthoredEvents(
      pubkey,
      [event('legacy-content-event', 100, [], nativeUrl, 1)],
      'wss://relay.example'
    );
    await store.put('event_reference', {
      id: `${pubkey}:legacy-content-event:content:0`,
      pubkey,
      eventId: 'legacy-content-event',
      sha256: hashA,
      role: 'content',
      isDirect: false,
      extractedAt: 1,
      extractorVersion: 2,
    });
    const profile = await store.get<{ pubkey: string; createdAt: number; catalogVersion: number }>('profile', pubkey);
    await store.put('profile', { ...profile!, eventExtractorVersion: 2 });

    await catalog.reprojectEvents(pubkey);

    expect(
      await store.get<{ url?: string }>('event_reference', `${pubkey}:legacy-content-event:content:0`)
    ).toMatchObject({
      url: nativeUrl,
    });
  });

  it('caches event metadata for meaningful, searchable media timeline projections', async () => {
    const store = new MemoryCatalogStore();
    const catalog = new Catalog(store);
    const video = event(
      'video-event',
      200,
      [
        ['x', hashA],
        ['title', 'Garden birds'],
        ['summary', 'Slow motion footage from the nesting box'],
      ],
      'Spring field recording',
      34235
    );

    await catalog.ingestAuthoredEvents(pubkey, [video], 'wss://relay.example');
    await projectCatalogAssets(catalog, pubkey);

    expect(await queryCatalogTimeline(catalog, pubkey, { types: ['video'], search: 'nesting box' })).toEqual([
      expect.objectContaining({
        eventId: 'video-event',
        displayType: 'video',
        displayTitle: 'Garden birds',
        displaySubtitle: 'Slow motion footage from the nesting box',
      }),
    ]);
    expect(await store.getAll<{ eventId: string; searchText: string }>('timeline_event')).toEqual([
      expect.objectContaining({ eventId: 'video-event', searchText: expect.stringContaining('nesting box') }),
    ]);
  });

  it('projects MIME-identified images without events and summaries for event attachments', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://media.example', type: 'blossom' },
      blobs: [
        { ...blob(hashA), size: 1_000_000, type: 'image/jpeg', uploaded: 1_700_000_000 },
        { ...blob(hashB), size: 2_000_000, type: 'video/mp4', uploaded: 1_700_000_100 },
        { ...blob(hashC), size: 500_000, type: 'image/jpeg', uploaded: 1_700_000_200 },
        { ...blob(hashD), size: 3_000_000, type: 'image/webp', uploaded: 1_700_000_300 },
      ],
      state: 'complete',
    });
    await catalog.ingestAuthoredEvents(
      pubkey,
      [
        event(
          'video-with-thumbnail',
          300,
          [
            ['x', hashB],
            ['thumb', `https://media.example/${hashC}`],
          ],
          '',
          34235
        ),
        event(
          'image-file-metadata',
          200,
          [
            ['m', 'image/webp'],
            ['x', hashD],
          ],
          '',
          1063
        ),
      ],
      'wss://relay.example'
    );

    await projectCatalogAssets(catalog, pubkey);
    const timeline = await queryCatalogTimeline(catalog, pubkey);

    const videoProjection = timeline.find(item => item.eventId === 'video-with-thumbnail');
    expect(videoProjection).toMatchObject({
      displayType: 'video',
      primaryUrl: `https://media.example/${hashB}`,
      previewUrl: `https://media.example/${hashC}`,
      blobCount: 2,
      totalBlobSize: 2_500_000,
      unknownBlobSizeCount: 0,
    });
    if (!videoProjection) throw new Error('Video projection was not created');
    expect(await getCatalogTimelineAsset(catalog, pubkey, videoProjection.assetId)).toMatchObject({
      projection: expect.objectContaining({ assetId: videoProjection.assetId }),
      event: expect.objectContaining({
        id: 'video-with-thumbnail',
        tags: expect.arrayContaining([
          ['x', hashB],
          ['thumb', `https://media.example/${hashC}`],
        ]),
      }),
      blobs: [
        expect.objectContaining({
          sha256: hashB,
          role: 'primary',
          mimeType: 'video/mp4',
          size: 2_000_000,
          urls: [`https://media.example/${hashB}`],
        }),
        expect.objectContaining({
          sha256: hashC,
          role: 'thumbnail',
          mimeType: 'image/jpeg',
          size: 500_000,
          urls: [`https://media.example/${hashC}`],
        }),
      ],
    });
    expect(timeline.find(item => item.eventId === 'image-file-metadata')).toMatchObject({
      displayType: 'image',
      blobCount: 1,
      totalBlobSize: 3_000_000,
    });
    expect(timeline.find(item => item.primaryBlobSha256 === hashA)).toMatchObject({
      eventId: undefined,
      displayType: 'image',
      displayDate: 1_700_000_000_000,
      displayDateSource: 'blob-uploaded',
      blobCount: 1,
      totalBlobSize: 1_000_000,
    });
  });

  it('classifies audio/mpeg file metadata as audio', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://media.example', type: 'blossom' },
      blobs: [{ ...blob(hashA), type: 'audio/mpeg; charset=binary' }],
      state: 'complete',
    });
    await catalog.ingestAuthoredEvents(
      pubkey,
      [
        event(
          'mpeg-file',
          400,
          [
            ['m', 'Audio/MPEG'],
            ['x', hashA],
          ],
          '',
          1063
        ),
      ],
      'wss://relay.example'
    );
    await projectCatalogAssets(catalog, pubkey);

    expect(await queryCatalogTimeline(catalog, pubkey, { types: ['audio'] })).toEqual([
      expect.objectContaining({ eventId: 'mpeg-file', displayType: 'audio' }),
    ]);

    await catalog.ingestId3(hashA, { title: 'Extracted track', artist: 'Extracted artist' });
    await projectCatalogAssets(catalog, pubkey, { force: true });
    expect(await queryCatalogTimeline(catalog, pubkey, { types: ['audio'] })).toEqual([
      expect.objectContaining({
        eventId: 'mpeg-file',
        displayTitle: 'Extracted track',
        displaySubtitle: 'Extracted artist',
      }),
    ]);
  });

  it('uses extracted ID3 metadata for standalone audio timeline entries', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://media.example', type: 'blossom' },
      blobs: [{ ...blob(hashA), url: `https://media.example/${hashA}.mp3`, type: 'audio/mpeg' }],
      state: 'complete',
    });
    await projectCatalogAssets(catalog, pubkey);
    // A file named after its own hash is not a name: the kind label stands in until
    // ID3 supplies a real one.
    expect(await queryCatalogTimeline(catalog, pubkey, { types: ['audio'] })).toEqual([
      expect.objectContaining({
        displayTitle: 'MP3 audio',
        displayTitleIsFallback: true,
        displayKindLabel: 'MP3 audio',
      }),
    ]);

    await catalog.ingestId3(hashA, { title: 'Track title', artist: 'Artist name', album: 'Album name', year: '2026' });
    await projectCatalogAssets(catalog, pubkey, { force: true });

    expect(await queryCatalogTimeline(catalog, pubkey, { types: ['audio'] })).toEqual([
      expect.objectContaining({ displayTitle: 'Track title', displaySubtitle: 'Artist name · Album name (2026)' }),
    ]);
  });

  it('groups multi-level HLS playlist descendants under one video asset with summed sizes', async () => {
    const store = new MemoryCatalogStore();
    const catalog = new Catalog(store);
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://cdn.example', type: 'blossom' },
      blobs: [
        { ...blob(hashA), url: 'https://cdn.example/master.m3u8', type: 'text/plain', size: 100 },
        { sha256: hashB, url: `https://cdn.example/${hashB}`, type: '', size: 200, uploaded: 0 },
        { sha256: hashC, url: `https://cdn.example/${hashC}`, type: '', size: 300, uploaded: 0 },
      ],
      state: 'complete',
    });
    await catalog.enrichHls(pubkey, hashA, async url => {
      if (url.endsWith('master.m3u8')) return `#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nhttps://cdn.example/${hashB}`;
      return `#EXTM3U\n#EXTINF:4,\nhttps://cdn.example/${hashC}`;
    });
    await projectCatalogAssets(catalog, pubkey);

    expect(await queryCatalogTimeline(catalog, pubkey, { types: ['video'] })).toEqual([
      expect.objectContaining({
        displayType: 'video',
        primaryBlobSha256: hashA,
        blobCount: 3,
        totalBlobSize: 600,
        displayKindLabel: 'HLS video',
        // Master playlist + variant playlist + one segment: a card must be able to
        // say "1 playlist + 1 segment" instead of "3 files".
        segmentCount: 1,
        displayDurationSeconds: 4,
      }),
    ]);
  });

  it('finds playlist candidates the server listings never mention', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    // hashA is on a server and typed as binary; hashB is known only from an event's
    // .m3u8 URL, so a scan over server listings would never offer it for expansion.
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://cdn.example', type: 'blossom' },
      blobs: [{ sha256: hashA, url: `https://cdn.example/${hashA}`, type: '', size: 300, uploaded: 0 }],
      state: 'complete',
    });
    await catalog.ingestAuthoredEvents(
      pubkey,
      [
        event(
          'hls-event',
          100,
          [
            ['x', hashB],
            ['url', `https://cdn.example/${hashB}.m3u8`],
          ],
          '',
          21
        ),
      ],
      'wss://relay.example'
    );

    expect(await catalog.queryPlaylistHashes()).toEqual([hashB]);

    // Nothing has read hashA's bytes, so it is offered for identification; the
    // playlist's own segments are not, being neither generic nor unexplained.
    const unidentified = await catalog.queryUnidentifiedBlobs(pubkey);
    expect(unidentified.map(item => item.sha256)).toContain(hashA);

    const playlist = new Uint8Array(new TextEncoder().encode('#EXTM3U\n#EXTINF:4,\n'));
    await catalog.enrichBlobPrefix(pubkey, hashA, `https://cdn.example/${hashA}`, async () => ({
      bytes: playlist.buffer,
      mimeType: 'application/octet-stream',
      size: 300,
      truncated: false,
    }));

    // The bytes reclassify it, which is what brings it back as a playlist candidate,
    // and it drops out of the identification queue.
    expect((await catalog.queryPlaylistHashes()).sort()).toEqual([hashA, hashB].sort());
    expect((await catalog.queryUnidentifiedBlobs(pubkey)).map(item => item.sha256)).not.toContain(hashA);
  });

  it('types and names files the server only describes as application/octet-stream', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://cdn.example', type: 'blossom' },
      blobs: [
        {
          sha256: hashA,
          url: `https://cdn.example/${hashA}.mp4`,
          type: 'application/octet-stream',
          size: 10,
          uploaded: 0,
        },
        {
          sha256: hashB,
          url: `https://cdn.example/${hashB}.bin`,
          type: 'application/octet-stream',
          size: 20,
          uploaded: 0,
        },
      ],
      state: 'complete',
    });
    await projectCatalogAssets(catalog, pubkey);
    const timeline = await queryCatalogTimeline(catalog, pubkey);

    // The extension is enough for the first file; the second says nothing until its
    // bytes are read, and must not claim a type it cannot back up.
    const [byExtension, unclassified] = [hashA, hashB].map(hash =>
      timeline.find(item => item.primaryBlobSha256 === hash)
    );
    expect(byExtension).toMatchObject({
      displayType: 'video',
      displayKindLabel: 'MP4 video',
      displayTitle: 'MP4 video',
    });
    expect(unclassified).toMatchObject({ displayType: 'unknown', displayKindLabel: 'Unclassified file' });

    const webm = new Uint8Array(64);
    webm.set([0x1a, 0x45, 0xdf, 0xa3], 0);
    await catalog.enrichBlobPrefix(pubkey, hashB, `https://cdn.example/${hashB}.bin`, async () => ({
      bytes: webm.buffer,
      mimeType: 'application/octet-stream',
      size: 20,
      truncated: false,
    }));
    // Deliberately not forced: reading a file's bytes must count as a mutation, or
    // the projection considers itself current and the new type never reaches a card.
    expect(await catalog.isProjectionStale(pubkey)).toBe(true);
    await projectCatalogAssets(catalog, pubkey);

    const sniffed = (await queryCatalogTimeline(catalog, pubkey)).find(item => item.primaryBlobSha256 === hashB);
    expect(sniffed).toMatchObject({ displayType: 'video', displayKindLabel: 'WebM video' });
  });

  it('filters the timeline to assets with at least one present blob on the given server', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://one.example', type: 'blossom' },
      blobs: [blob(hashA)],
      state: 'complete',
    });
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://two.example', type: 'blossom' },
      blobs: [blob(hashB)],
      state: 'complete',
    });
    await projectCatalogAssets(catalog, pubkey);
    const hostedOn: Record<string, string> = { [hashA]: 'https://one.example', [hashB]: 'https://two.example' };
    await refreshReplicaAvailability(catalog, pubkey, async (server, sha256) => ({
      status: hostedOn[sha256] === server.baseUrl ? 200 : 404,
      size: 42,
      mimeType: 'image/jpeg',
    }));

    const onServerOne = await queryCatalogTimeline(catalog, pubkey, { serverId: 'https://one.example' });
    expect(onServerOne.map(item => item.assetId)).toEqual([`${pubkey}:root-blob:${hashA}`]);

    const onServerTwo = await queryCatalogTimeline(catalog, pubkey, { serverId: 'https://two.example' });
    expect(onServerTwo.map(item => item.assetId)).toEqual([`${pubkey}:root-blob:${hashB}`]);

    const onUnknownServer = await queryCatalogTimeline(catalog, pubkey, { serverId: 'https://three.example' });
    expect(onUnknownServer).toEqual([]);
  });

  it('sorts the timeline by the requested field and direction', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://media.example', type: 'blossom' },
      blobs: [
        { ...blob(hashA), size: 10, uploaded: 300 },
        { ...blob(hashB), size: 30, uploaded: 100 },
        { ...blob(hashC), size: 20, uploaded: 200 },
      ],
      state: 'complete',
    });
    await projectCatalogAssets(catalog, pubkey);

    const bySizeAsc = await queryCatalogTimeline(catalog, pubkey, { sort: { field: 'size', direction: 'asc' } });
    expect(bySizeAsc.map(item => item.primaryBlobSha256)).toEqual([hashA, hashC, hashB]);

    const byDateAsc = await queryCatalogTimeline(catalog, pubkey, { sort: { field: 'date', direction: 'asc' } });
    expect(byDateAsc.map(item => item.primaryBlobSha256)).toEqual([hashB, hashC, hashA]);
  });

  it('matches a sha256 prefix of any asset blob as a search term', async () => {
    const catalog = new Catalog(new MemoryCatalogStore());
    await catalog.ingestServerList(pubkey, {
      server: { url: 'https://media.example', type: 'blossom' },
      blobs: [blob(hashA), blob(hashB)],
      state: 'complete',
    });
    await projectCatalogAssets(catalog, pubkey);

    const matched = await queryCatalogTimeline(catalog, pubkey, { search: hashA.slice(0, 10) });
    expect(matched.map(item => item.primaryBlobSha256)).toEqual([hashA]);

    const unmatched = await queryCatalogTimeline(catalog, pubkey, { search: 'zzzzzzzz' });
    expect(unmatched).toEqual([]);
  });

  it('classifies search terms so Browse and the catalog agree on what is a hash', () => {
    // Browse filters text terms client-side and delegates hash terms to the catalog,
    // so a term must never be treated as both or as neither.
    expect(isHashSearchTerm(hashA.slice(0, 8))).toBe(true);
    expect(isHashSearchTerm(hashA)).toBe(true);
    expect(isHashSearchTerm(hashA.slice(0, 7))).toBe(false);
    expect(isHashSearchTerm('deadbeef')).toBe(true);
    expect(isHashSearchTerm('DEADBEEF')).toBe(false);
    expect(isHashSearchTerm('nesting box')).toBe(false);
    expect(isHashSearchTerm('sunset.jpg')).toBe(false);
  });

  it('splits and normalises search input the same way for both search paths', () => {
    expect(splitSearchTerms(undefined)).toEqual([]);
    expect(splitSearchTerms('   ')).toEqual([]);
    expect(splitSearchTerms('  Nesting   BOX ')).toEqual(['nesting', 'box']);
  });

  it('builds a replica map whose sources exclude native URLs and whose destinations include absent enabled servers', async () => {
    const store = new MemoryCatalogStore();
    const catalog = new Catalog(store);
    for (const url of ['https://one.example', 'https://two.example', 'https://three.example']) {
      await catalog.ingestServerList(pubkey, { server: { url, type: 'blossom' }, state: 'complete' });
    }
    await catalog.ingestAuthoredEvents(pubkey, [event('replica-map', 100, [['x', hashA]])], 'wss://relay.example');
    await projectCatalogAssets(catalog, pubkey);
    const [asset] = await queryCatalogTimeline(catalog, pubkey);
    await store.put('blob_location', {
      id: `${hashA}:https://one.example`,
      sha256: hashA,
      serverId: 'https://one.example',
      state: 'present',
      lastCheckedAt: 1,
      nextCheckAt: 2,
      canonicalUrl: `https://one.example/${hashA}`,
      consecutiveFailures: 0,
      source: 'replica',
    });
    await store.put('blob_location', {
      id: `${hashA}:https://two.example`,
      sha256: hashA,
      serverId: 'https://two.example',
      state: 'present',
      lastCheckedAt: 1,
      nextCheckAt: 2,
      canonicalUrl: `https://two.example/${hashA}`,
      consecutiveFailures: 0,
      source: 'native-url',
    });

    expect(await getAssetReplicaMap(catalog, pubkey, asset.assetId)).toEqual([
      expect.objectContaining({
        sha256: hashA,
        sources: [{ serverId: 'https://one.example', baseUrl: 'https://one.example', serverType: 'blossom' }],
        presentOn: ['https://one.example', 'https://two.example'],
        absentFrom: [{ serverId: 'https://three.example', baseUrl: 'https://three.example' }],
      }),
    ]);
  });

  it('builds mirror operations only for the named absent target', () => {
    const replicaMap = [
      {
        sha256: hashA,
        assetId: 'asset',
        role: 'main',
        sources: [{ serverId: 'source', baseUrl: 'https://source.example', serverType: 'blossom' as const }],
        presentOn: ['source'],
        absentFrom: [
          { serverId: 'one', baseUrl: 'https://one.example' },
          { serverId: 'two', baseUrl: 'https://two.example' },
        ],
      },
    ];
    expect(buildReplicaOps(replicaMap, 'two')).toEqual([
      {
        sha256: hashA,
        assetId: 'asset',
        sourceBaseUrl: 'https://source.example',
        targetServerId: 'two',
        targetBaseUrl: 'https://two.example',
      },
    ]);
  });

  it('builds sync operations for every absent blob and server pair', () => {
    const replicaMap = [
      {
        sha256: hashA,
        assetId: 'asset',
        role: 'main',
        sources: [
          { serverId: 'z-source', baseUrl: 'https://z.example', serverType: 'blossom' as const },
          { serverId: 'a-source', baseUrl: 'https://a.example', serverType: 'blossom' as const },
        ],
        presentOn: ['z-source', 'a-source'],
        absentFrom: [{ serverId: 'one', baseUrl: 'https://one.example' }],
      },
      {
        sha256: hashB,
        assetId: 'asset',
        role: 'thumbnail',
        sources: [{ serverId: 'source', baseUrl: 'https://source.example', serverType: 'blossom' as const }],
        presentOn: ['source'],
        absentFrom: [
          { serverId: 'one', baseUrl: 'https://one.example' },
          { serverId: 'two', baseUrl: 'https://two.example' },
        ],
      },
    ];
    expect(buildReplicaOps(replicaMap)).toEqual([
      {
        sha256: hashA,
        assetId: 'asset',
        sourceBaseUrl: 'https://a.example',
        targetServerId: 'one',
        targetBaseUrl: 'https://one.example',
      },
      {
        sha256: hashB,
        assetId: 'asset',
        sourceBaseUrl: 'https://source.example',
        targetServerId: 'one',
        targetBaseUrl: 'https://one.example',
      },
      {
        sha256: hashB,
        assetId: 'asset',
        sourceBaseUrl: 'https://source.example',
        targetServerId: 'two',
        targetBaseUrl: 'https://two.example',
      },
    ]);
  });

  it('builds no operations for blobs already present on every target', () => {
    expect(
      buildReplicaOps([
        {
          sha256: hashA,
          assetId: 'asset',
          role: 'main',
          sources: [{ serverId: 'source', baseUrl: 'https://source.example', serverType: 'blossom' as const }],
          presentOn: ['source', 'target'],
          absentFrom: [],
        },
      ])
    ).toEqual([]);
  });

  it('builds no operations for a blob without a usable source in mirror or sync mode', () => {
    const replicaMap = [
      {
        sha256: hashA,
        assetId: 'asset',
        role: 'main',
        sources: [],
        presentOn: [],
        absentFrom: [{ serverId: 'target', baseUrl: 'https://target.example' }],
      },
    ];
    expect(buildReplicaOps(replicaMap, 'target')).toEqual([]);
    expect(buildReplicaOps(replicaMap)).toEqual([]);
  });
});
