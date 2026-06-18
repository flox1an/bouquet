import type { BlobDescriptor } from 'blossom-client-sdk';
import type { NostrEvent } from 'nostr-tools';
import { extractHashFromUrl, extractHashesFromContent } from './blossom';
export const RELATIONSHIP_EVENT_KINDS = [1063, 30563, 1, 20, 21, 22, 34235, 34236, 31337] as const;

export type BlobNode = {
  kind: 'blob';
  id: string;
  sha256?: string;
  url: string;
  mimeType?: string;
  size?: number;
  uploaded?: number;
  dimensions?: string;
};

export type EventNode = {
  kind: 'event';
  id: string;
  eventId: string;
  eventKind: number;
  pubkey: string;
  createdAt: number;
  title?: string;
};

export type PlaylistNode = {
  kind: 'playlist';
  id: string;
  url: string;
  sha256?: string;
  sourceBlobId?: string;
  parseState: 'pending' | 'parsed' | 'parse-failed' | 'truncated';
};

export type SegmentNode = {
  kind: 'segment';
  id: string;
  url: string;
  sha256?: string;
  sourceBlobId?: string;
  isInit?: boolean;
  duration?: number;
};

export type UnknownBucketNode = {
  kind: 'unknown-bucket';
  id: 'unreferenced' | 'ambiguous' | 'parse-failed' | 'external-only';
};

export type ExternalNode = {
  kind: 'external';
  id: string;
  url: string;
  sha256?: string;
  mimeType?: string;
};

export type BlobGraphNode = BlobNode | EventNode | PlaylistNode | SegmentNode | UnknownBucketNode | ExternalNode;

export type BlobGraphEdge = {
  from: string;
  to: string;
  kind:
    | 'event-references-blob'
    | 'event-references-playlist'
    | 'playlist-references-playlist'
    | 'playlist-references-segment'
    | 'blob-matches-url'
    | 'blob-matches-hash';
  provenance: {
    source: 'nostr-event' | 'playlist-body' | 'server-blob';
    eventId?: string;
    playlistUrl?: string;
    match?: 'hash' | 'url' | 'content-sniff';
  };
};

export type UnknownBucket = UnknownBucketNode & { items: BlobGraphNode[] };

export type BlobRelationshipGraph = {
  nodes: Record<string, BlobGraphNode>;
  edges: BlobGraphEdge[];
  roots: Array<EventNode | PlaylistNode>;
  unknownBuckets: Record<UnknownBucketNode['id'], UnknownBucket>;
};

export type BlobRelationshipGraphInput = {
  blobs: BlobDescriptor[];
  events: NostrEvent[];
  playlistBodies?: Map<string, string | undefined>;
  limits?: Partial<PlaylistExpansionLimits>;
};

export type PlaylistExpansionLimits = {
  maxDepth: number;
  maxDescendants: number;
};

export type ParsedHlsPlaylist = {
  playlistUrls: string[];
  segments: Array<{ url: string; isInit?: boolean; duration?: number }>;
};

export type RelationshipAction = 'delete' | 'mirror' | 'sync';

export type ActionEligibility = {
  enabled: boolean;
  reason?: string;
  targets: BlobNode[];
};

const PLAYLIST_MIME_TYPES: Record<string, true> = {
  'application/vnd.apple.mpegurl': true,
  'application/x-mpegurl': true,
  'audio/mpegurl': true,
  'audio/x-mpegurl': true,
};

const DEFAULT_LIMITS: PlaylistExpansionLimits = {
  maxDepth: 3,
  maxDescendants: 200,
};
const MAX_PLAYLIST_SNIFF_BYTES = 512 * 1024;

const blobId = (sha256: string) => `blob:${sha256}`;
const playlistId = (url: string) => `playlist:${url}`;
const segmentId = (url: string) => `segment:${url}`;
const externalId = (url: string) => `external:${url}`;

export function isHlsPlaylistBody(body: string): boolean {
  const normalized = body.replace(/^\uFEFF/, '').trimStart();
  if (!normalized.startsWith('#EXTM3U')) return false;
  return /#EXT-X-STREAM-INF|#EXTINF|#EXT-X-MAP/.test(normalized);
}

export function parseHlsPlaylist(url: string, body: string): ParsedHlsPlaylist {
  const playlistUrls: string[] = [];
  const segments: ParsedHlsPlaylist['segments'] = [];
  const lines = body
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  let nextIsVariant = false;
  let nextDuration: number | undefined;

  for (const line of lines) {
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      nextIsVariant = true;
      continue;
    }

    if (line.startsWith('#EXTINF')) {
      const duration = /^#EXTINF:([^,]+)/.exec(line)?.[1];
      nextDuration = duration ? Number(duration) : undefined;
      continue;
    }

    if (line.startsWith('#EXT-X-MAP')) {
      const initUrl = /URI="([^"]+)"/.exec(line)?.[1] ?? /URI=([^,]+)/.exec(line)?.[1];
      if (initUrl) segments.push({ url: new URL(initUrl, url).href, isInit: true });
      continue;
    }

    if (line.startsWith('#')) continue;

    const resolved = new URL(line, url).href;
    if (nextIsVariant) {
      playlistUrls.push(resolved);
      nextIsVariant = false;
    } else {
      segments.push({ url: resolved, duration: nextDuration });
      nextDuration = undefined;
    }
  }

  return { playlistUrls, segments };
}

export function isPlaylistCandidate(value: { url?: string; mimeType?: string; size?: number; type?: string }): boolean {
  const mimeType = value.mimeType ?? value.type;
  if (mimeType && PLAYLIST_MIME_TYPES[mimeType.toLowerCase()]) return true;
  if (value.url?.toLowerCase().split('?')[0].endsWith('.m3u8')) return true;
  if (value.size !== undefined && value.size > MAX_PLAYLIST_SNIFF_BYTES) return false;
  return !mimeType || mimeType.toLowerCase().startsWith('text/plain');
}

export function buildBlobRelationshipGraph(input: BlobRelationshipGraphInput): BlobRelationshipGraph {
  const nodes: Record<string, BlobGraphNode> = {};
  const edges: BlobGraphEdge[] = [];
  const roots: Array<EventNode | PlaylistNode> = [];
  const unknownBuckets: BlobRelationshipGraph['unknownBuckets'] = {
    unreferenced: { kind: 'unknown-bucket', id: 'unreferenced', items: [] },
    ambiguous: { kind: 'unknown-bucket', id: 'ambiguous', items: [] },
    'parse-failed': { kind: 'unknown-bucket', id: 'parse-failed', items: [] },
    'external-only': { kind: 'unknown-bucket', id: 'external-only', items: [] },
  };
  const limits = { ...DEFAULT_LIMITS, ...input.limits };
  const blobsByHash = new Map<string, BlobDescriptor>();
  const blobsByUrl = new Map<string, BlobDescriptor>();
  const parentCounts = new Map<string, number>();
  let descendantCount = 0;

  const addNode = (node: BlobGraphNode) => {
    nodes[node.id] = node;
    return node;
  };

  const addEdge = (edge: BlobGraphEdge) => {
    edges.push(edge);
    if (
      edge.kind === 'event-references-blob' ||
      edge.kind === 'event-references-playlist' ||
      edge.kind === 'playlist-references-playlist' ||
      edge.kind === 'playlist-references-segment' ||
      (edge.kind.startsWith('blob-matches-') && !edge.from.startsWith('event:'))
    ) {
      parentCounts.set(edge.to, (parentCounts.get(edge.to) ?? 0) + 1);
    }
  };

  for (const blob of input.blobs) {
    blobsByHash.set(blob.sha256, blob);
    blobsByUrl.set(blob.url, blob);
    addNode({
      kind: 'blob',
      id: blobId(blob.sha256),
      sha256: blob.sha256,
      url: blob.url,
      mimeType: blob.type,
      size: blob.size,
      uploaded: blob.uploaded,
    });
  }

  const findBlobForReference = (reference: { url?: string; hash?: string }) => {
    if (reference.hash) {
      const byHash = blobsByHash.get(reference.hash);
      if (byHash) return { blob: byHash, match: 'hash' as const };
    }
    if (reference.url) {
      const embeddedHash = extractHashFromUrl(reference.url);
      if (embeddedHash) {
        const byEmbeddedHash = blobsByHash.get(embeddedHash);
        if (byEmbeddedHash) return { blob: byEmbeddedHash, match: 'hash' as const };
      }
      const byUrl = blobsByUrl.get(reference.url);
      if (byUrl) return { blob: byUrl, match: 'url' as const };
    }
    return undefined;
  };

  const ensurePlaylistNode = (url: string, sourceBlob?: BlobDescriptor, parseState: PlaylistNode['parseState'] = 'pending') => {
    const id = playlistId(url);
    const existing = nodes[id];
    if (existing?.kind === 'playlist') {
      if (parseState === 'truncated' || existing.parseState === 'pending') existing.parseState = parseState;
      return existing;
    }
    return addNode({
      kind: 'playlist',
      id,
      url,
      sha256: sourceBlob?.sha256,
      sourceBlobId: sourceBlob ? blobId(sourceBlob.sha256) : undefined,
      parseState,
    }) as PlaylistNode;
  };

  const markTruncated = (ancestors: PlaylistNode[]) => {
    for (const ancestor of ancestors) ancestor.parseState = 'truncated';
  };

  const expandPlaylist = (playlist: PlaylistNode, depth: number, ancestors: PlaylistNode[]) => {
    const body = input.playlistBodies?.get(playlist.url);
    if (body === undefined) {
      playlist.parseState = 'parse-failed';
      unknownBuckets['parse-failed'].items.push(playlist);
      return;
    }
    if (!isHlsPlaylistBody(body)) {
      playlist.parseState = 'parse-failed';
      unknownBuckets['parse-failed'].items.push(playlist);
      return;
    }
    if (depth > limits.maxDepth) {
      playlist.parseState = 'truncated';
      markTruncated(ancestors);
      return;
    }

    playlist.parseState = 'parsed';
    const parsed = parseHlsPlaylist(playlist.url, body);

    for (const childUrl of parsed.playlistUrls) {
      descendantCount += 1;
      const childBlob = blobsByUrl.get(childUrl) ?? blobsByHash.get(extractHashFromUrl(childUrl) ?? '');
      const child = ensurePlaylistNode(childUrl, childBlob, descendantCount > limits.maxDescendants ? 'truncated' : 'pending');
      addEdge({
        from: playlist.id,
        to: child.id,
        kind: 'playlist-references-playlist',
        provenance: { source: 'playlist-body', playlistUrl: playlist.url },
      });
      if (childBlob) {
        addEdge({
          from: child.id,
          to: blobId(childBlob.sha256),
          kind: childBlob.sha256 === child.sha256 ? 'blob-matches-hash' : 'blob-matches-url',
          provenance: { source: 'server-blob', playlistUrl: child.url, match: childBlob.sha256 === child.sha256 ? 'hash' : 'url' },
        });
      }
      if (descendantCount > limits.maxDescendants || depth + 1 > limits.maxDepth) {
        child.parseState = 'truncated';
        markTruncated([...ancestors, playlist]);
      } else {
        expandPlaylist(child, depth + 1, [...ancestors, playlist]);
      }
    }

    for (const parsedSegment of parsed.segments) {
      descendantCount += 1;
      if (descendantCount > limits.maxDescendants) {
        playlist.parseState = 'truncated';
        markTruncated(ancestors);
        continue;
      }
      const matched = findBlobForReference({ url: parsedSegment.url });
      const segment: SegmentNode = {
        kind: 'segment',
        id: segmentId(parsedSegment.url),
        url: parsedSegment.url,
        sha256: matched?.blob.sha256 ?? extractHashFromUrl(parsedSegment.url),
        sourceBlobId: matched ? blobId(matched.blob.sha256) : undefined,
        isInit: parsedSegment.isInit,
        duration: parsedSegment.duration,
      };
      addNode(segment);
      addEdge({
        from: playlist.id,
        to: segment.id,
        kind: 'playlist-references-segment',
        provenance: { source: 'playlist-body', playlistUrl: playlist.url },
      });
      if (matched) {
        addEdge({
          from: segment.id,
          to: blobId(matched.blob.sha256),
          kind: matched.match === 'hash' ? 'blob-matches-hash' : 'blob-matches-url',
          provenance: { source: 'server-blob', playlistUrl: playlist.url, match: matched.match },
        });
      }
    }
  };

  for (const ev of input.events) {
    const eventNode = addNode({
      kind: 'event',
      id: `event:${ev.id}`,
      eventId: ev.id,
      eventKind: ev.kind,
      pubkey: ev.pubkey,
      createdAt: ev.created_at,
      title: getTagValue(ev.tags, 'title') ?? getTagValue(ev.tags, 'subject'),
    }) as EventNode;
    roots.push(eventNode);

    const seenBlobSha256s = new Set<string>();
    const seenPlaylistUrls = new Set<string>();
    for (const reference of extractEventReferences(ev)) {
      const matched = findBlobForReference(reference);
      if (matched) {
        const isPlaylist = isPlaylistCandidate({ url: reference.url, mimeType: reference.mimeType, type: matched.blob.type });
        const playlistUrl = reference.url ?? matched.blob.url;
        if (isPlaylist) {
          if (seenPlaylistUrls.has(playlistUrl)) continue;
          seenPlaylistUrls.add(playlistUrl);
          const playlist = ensurePlaylistNode(playlistUrl, matched.blob);
          addEdge({
            from: eventNode.id,
            to: playlist.id,
            kind: 'event-references-playlist',
            provenance: { source: 'nostr-event', eventId: ev.id, match: matched.match },
          });
          addEdge({
            from: playlist.id,
            to: blobId(matched.blob.sha256),
            kind: matched.match === 'hash' ? 'blob-matches-hash' : 'blob-matches-url',
            provenance: { source: 'server-blob', eventId: ev.id, match: matched.match },
          });
        } else {
          if (seenBlobSha256s.has(matched.blob.sha256)) continue;
          seenBlobSha256s.add(matched.blob.sha256);
          const blobNode = nodes[blobId(matched.blob.sha256)] as BlobNode | undefined;
          if (blobNode && reference.dimensions && !blobNode.dimensions) {
            blobNode.dimensions = reference.dimensions;
          }
          addEdge({
            from: eventNode.id,
            to: blobId(matched.blob.sha256),
            kind: 'event-references-blob',
            provenance: { source: 'nostr-event', eventId: ev.id, match: matched.match },
          });
        }
      } else if (reference.url && !seenBlobSha256s.has(reference.hash ?? '')) {
        const external = addNode({ kind: 'external', id: externalId(reference.url), url: reference.url, sha256: reference.hash, mimeType: reference.mimeType });
        if (!unknownBuckets['external-only'].items.find(n => n.id === external.id)) {
          unknownBuckets['external-only'].items.push(external);
        }
      }
    }
  }

  for (const blob of input.blobs) {
    if (!isPlaylistCandidate(blob)) continue;
    const body = input.playlistBodies?.get(blob.url);
    if (body !== undefined && !isHlsPlaylistBody(body)) continue;
    const playlist = ensurePlaylistNode(blob.url, blob, input.playlistBodies ? 'pending' : 'pending');
    if ((parentCounts.get(blobId(blob.sha256)) ?? 0) === 0) roots.push(playlist);
    if (input.playlistBodies) expandPlaylist(playlist, 0, []);
  }

  for (const node of Object.values(nodes)) {
    if (node.kind !== 'blob') continue;
    const count = parentCounts.get(node.id) ?? 0;
    if (count === 0) unknownBuckets.unreferenced.items.push(node);
    else if (count > 1) unknownBuckets.ambiguous.items.push(node);
  }

  return { nodes, edges, roots, unknownBuckets };
}

export async function buildBlobRelationshipGraphAsync(
  input: Omit<BlobRelationshipGraphInput, 'playlistBodies'> & {
    fetchPlaylistBody: (url: string) => Promise<string | undefined>;
  }
): Promise<BlobRelationshipGraph> {
  const bodies = new Map<string, string | undefined>();
  const candidateUrls = input.blobs.filter(isPlaylistCandidate).map(blob => blob.url);
  await Promise.all(
    candidateUrls.map(async url => {
      try {
        bodies.set(url, await input.fetchPlaylistBody(url));
      } catch {
        bodies.set(url, undefined);
      }
    })
  );
  return buildBlobRelationshipGraph({ ...input, playlistBodies: bodies });
}

export function getActionEligibility(
  graph: BlobRelationshipGraph,
  selectedNodeIds: string[],
  action: RelationshipAction
): ActionEligibility {
  const targets: BlobNode[] = [];
  if (selectedNodeIds.length === 0) return { enabled: false, reason: 'No local blobs selected.', targets };
  if (action === 'delete' && Object.values(graph.nodes).some(node => node.kind === 'playlist' && node.parseState === 'truncated')) {
    return { enabled: false, reason: 'Playlist parsing was truncated.', targets };
  }

  const ambiguousIds = new Set(graph.unknownBuckets.ambiguous.items.map(node => node.id));
  for (const id of selectedNodeIds) {
    const node = graph.nodes[id];
    if (!node || node.kind !== 'blob') return { enabled: false, reason: 'Selection contains non-local references.', targets };
    if (ambiguousIds.has(id)) return { enabled: false, reason: 'Selection contains ambiguous relationships.', targets };
    targets.push(node);
  }

  return { enabled: true, targets };
}

function getTagValue(tags: string[][], name: string): string | undefined {
  return tags.find(tag => tag[0] === name)?.[1];
}

type EventReference = { url?: string; hash?: string; mimeType?: string; dimensions?: string };

function extractEventReferences(ev: NostrEvent): EventReference[] {
  const references: EventReference[] = [];
  const addUrl = (url: string | undefined, mimeType?: string) => {
    if (!url) return;
    references.push({ url, hash: extractHashFromUrl(url), mimeType });
  };
  const addHash = (hash: string | undefined, mimeType?: string) => {
    if (!hash) return;
    references.push({ hash, mimeType });
  };

  for (const tag of ev.tags) {
    const [name, value] = tag;
    if (name === 'x') addHash(value);
    else if (name === 'url' || name === 'image' || name === 'thumb') addUrl(value);
    else if (name === 'text-track') addUrl(value);
    else if (name === 'imeta') {
      let mimeType: string | undefined;
      let dimensions: string | undefined;
      const deferred: Omit<EventReference, 'mimeType' | 'dimensions'>[] = [];
      for (const item of tag.slice(1)) {
        const space = item.indexOf(' ');
        if (space < 1) continue;
        const key = item.slice(0, space);
        const itemValue = item.slice(space + 1);
        if (key === 'm') mimeType = itemValue;
        else if (key === 'dim') dimensions = itemValue;
        else if (key === 'x') deferred.push({ hash: itemValue });
        else if (key === 'url' || key === 'image' || key === 'fallback' || key === 'mirror') {
          deferred.push({ url: itemValue, hash: extractHashFromUrl(itemValue) });
        }
      }
      for (const reference of deferred) references.push({ ...reference, mimeType, dimensions });
    }
  }

  for (const hash of extractHashesFromContent(ev.content)) addHash(hash);

  return dedupeReferences(references);
}

function dedupeReferences(references: EventReference[]): EventReference[] {
  const seen = new Set<string>();
  const unique: EventReference[] = [];
  for (const reference of references) {
    const key = `${reference.hash ?? ''}|${reference.url ?? ''}|${reference.mimeType ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(reference);
  }
  return unique;
}
