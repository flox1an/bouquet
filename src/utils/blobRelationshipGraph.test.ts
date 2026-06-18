import { describe, expect, it } from 'vitest';
import type { BlobDescriptor } from 'blossom-client-sdk';
import type { NostrEvent } from 'nostr-tools';
import {
  buildBlobRelationshipGraph,
  getActionEligibility,
  isHlsPlaylistBody,
  parseHlsPlaylist,
} from './blobRelationshipGraph';

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const hashC = 'c'.repeat(64);
const hashD = 'd'.repeat(64);
const hashE = 'e'.repeat(64);
const hashP = '1'.repeat(64);

const blob = (sha256: string, url: string, type = 'video/mp4', size = 100): BlobDescriptor => ({
  sha256,
  url,
  type,
  size,
  uploaded: 1,
});

const event = (id: string, tags: string[][], content = ''): NostrEvent =>
  ({
    id,
    kind: 34235,
    pubkey: 'pubkey',
    created_at: 100,
    tags,
    content,
    sig: 'sig',
  }) as NostrEvent;

describe('blob relationship graph', () => {
  it('extracts event references from tags, imeta fields, text tracks, and content URLs', () => {
    const blobs = [
      blob(hashA, `https://cdn.example/${hashA}.mp4`),
      blob(hashB, `https://cdn.example/${hashB}.jpg`, 'image/jpeg'),
      blob(hashC, `https://cdn.example/${hashC}.vtt`, 'text/vtt'),
      blob(hashD, `https://cdn.example/${hashD}.mp4`),
      blob(hashE, `https://cdn.example/${hashE}.mp4`),
    ];

    const graph = buildBlobRelationshipGraph({
      blobs,
      events: [
        event('event-1', [
          ['title', 'Launch cut'],
          ['x', hashA],
          ['image', `https://cdn.example/${hashB}.jpg`],
          ['text-track', `https://cdn.example/${hashC}.vtt`, 'en'],
          ['imeta', `url https://cdn.example/${hashD}.mp4`, `x ${hashE}`, 'm video/mp4'],
        ], `fallback https://cdn.example/${hashA}.mp4`),
      ],
    });

    const root = graph.roots.find(node => node.kind === 'event' && node.eventId === 'event-1');
    expect(root).toMatchObject({ kind: 'event', title: 'Launch cut' });

    const referencedHashes = graph.edges
      .filter(edge => edge.from === root?.id && edge.kind === 'event-references-blob')
      .map(edge => graph.nodes[edge.to])
      .filter(node => node?.kind === 'blob')
      .map(node => node.sha256)
      .sort();

    expect(referencedHashes).toEqual([hashA, hashB, hashC, hashD, hashE].sort());
  });

  it('prefers hash matches, falls back to exact URLs, and keeps external URLs visible', () => {
    const external = 'https://remote.example/video.m3u8';
    const graph = buildBlobRelationshipGraph({
      blobs: [blob(hashA, `https://local.example/${hashA}`), blob(hashB, 'https://local.example/thumb.jpg', 'image/jpeg')],
      events: [
        event('event-1', [
          ['x', hashA],
          ['image', 'https://local.example/thumb.jpg'],
          ['url', external],
        ]),
      ],
    });

    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'event-references-blob', to: `blob:${hashA}`, provenance: expect.objectContaining({ match: 'hash' }) }),
        expect.objectContaining({ kind: 'event-references-blob', to: `blob:${hashB}`, provenance: expect.objectContaining({ match: 'url' }) }),
      ])
    );
    expect(graph.unknownBuckets['external-only'].items.map(item => item.id)).toContain(`external:${external}`);
  });

  it('sniffs and parses HLS master playlists, media playlists, init maps, and segments', () => {
    const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nlow/index.m3u8\n';
    const media = '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:4.0,\nseg-1.ts\n#EXTINF:5.5,\nhttps://cdn.example/seg-2.ts\n';

    expect(isHlsPlaylistBody(`\uFEFF  ${master}`)).toBe(true);
    expect(parseHlsPlaylist('https://cdn.example/master.m3u8', master).playlistUrls).toEqual([
      'https://cdn.example/low/index.m3u8',
    ]);
    expect(parseHlsPlaylist('https://cdn.example/low/index.m3u8', media).segments).toEqual([
      expect.objectContaining({ url: 'https://cdn.example/low/init.mp4', isInit: true }),
      expect.objectContaining({ url: 'https://cdn.example/low/seg-1.ts', duration: 4 }),
      expect.objectContaining({ url: 'https://cdn.example/seg-2.ts', duration: 5.5 }),
    ]);
  });

  it('builds playlist descendants, marks parse failures, and truncates bounded expansion', () => {
    const playlistUrl = `https://local.example/${hashP}.m3u8`;
    const childUrl = 'https://local.example/child.m3u8';
    const graph = buildBlobRelationshipGraph({
      blobs: [blob(hashP, playlistUrl, 'text/plain'), blob(hashA, 'https://local.example/seg-1.ts', 'video/mp2t')],
      events: [],
      playlistBodies: new Map([
        [playlistUrl, '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nchild.m3u8\n'],
        [childUrl, '#EXTM3U\n#EXTINF:4.0,\nseg-1.ts\n#EXTINF:4.0,\nseg-2.ts\n'],
      ]),
      limits: { maxDepth: 1, maxDescendants: 1 },
    });

    const root = graph.roots.find(node => node.kind === 'playlist' && node.url === playlistUrl);
    expect(root).toMatchObject({ kind: 'playlist', parseState: 'truncated' });
    expect(graph.edges).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'playlist-references-playlist' })]));

    const failed = buildBlobRelationshipGraph({
      blobs: [blob(hashP, playlistUrl, 'application/vnd.apple.mpegurl')],
      events: [],
      playlistBodies: new Map([[playlistUrl, undefined]]),
    });
    expect(failed.unknownBuckets['parse-failed'].items.map(item => item.id)).toContain(`playlist:${playlistUrl}`);
  });

  it('buckets unreferenced and ambiguous blobs and gates destructive group actions', () => {
    const local = blob(hashA, `https://local.example/${hashA}.mp4`);
    const ambiguous = blob(hashB, `https://local.example/${hashB}.mp4`);
    const graph = buildBlobRelationshipGraph({
      blobs: [local, ambiguous, blob(hashC, `https://local.example/${hashC}.mp4`)],
      events: [event('event-1', [['x', hashA], ['x', hashB]]), event('event-2', [['x', hashB]])],
    });

    expect(graph.unknownBuckets.unreferenced.items.map(item => item.id)).toContain(`blob:${hashC}`);
    expect(graph.unknownBuckets.ambiguous.items.map(item => item.id)).toContain(`blob:${hashB}`);

    expect(getActionEligibility(graph, [`blob:${hashA}`], 'delete')).toMatchObject({ enabled: true });
    expect(getActionEligibility(graph, [`blob:${hashB}`], 'delete')).toMatchObject({ enabled: false });
    expect(getActionEligibility(graph, [`external:https://example.com/outside.mp4`], 'mirror')).toMatchObject({ enabled: false });

    const truncatedGraph = buildBlobRelationshipGraph({
      blobs: [blob(hashP, `https://local.example/${hashP}.m3u8`, 'application/vnd.apple.mpegurl')],
      events: [],
      playlistBodies: new Map([[`https://local.example/${hashP}.m3u8`, '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nchild.m3u8\n']]),
      limits: { maxDepth: 0, maxDescendants: 1 },
    });
    expect(getActionEligibility(truncatedGraph, [`blob:${hashP}`], 'delete')).toMatchObject({ enabled: false });
  });
});
