# Blob Relationship Tree Browse Mode Design

## Problem

Bouquet currently browses Blossom server blobs mostly as flat blob lists or MIME-filtered galleries. That is insufficient for operations such as delete, mirror, and sync, because a single logical asset can span multiple blobs:

- a Nostr video event can reference several video variants, thumbnails, text tracks, fallback URLs, and mirrors;
- an HLS master playlist can reference variant playlists;
- variant playlists can reference init segments and media segments;
- Blossom servers may store playlists with weak MIME metadata such as `text/plain`.

The feature needs to answer: “What logical thing does this blob belong to?” before exposing safe group operations.

## Decisions

- Add a new browse mode named **Relationships**.
- Use a typed in-memory graph index derived from current source data. Do not add a hosted or client-side graph database.
- v1 uses relevant events authored by the active profile only. Future global search is modeled as an additional event source, not a different architecture.
- Roots can be Nostr events or playlists.
- Unknown/unassigned blobs are grouped under an Unknown root with internal buckets.
- HLS playlists are detected by content sniffing, not by URL suffix alone.
- Playlist expansion is bounded eager: fetch enough to build useful group trees while preventing runaway recursive fetches.
- Group actions are gated by provenance. Bulk destructive operations require unambiguous local blob nodes.

## Data Model

The graph index is derived state built from Blossom blobs, Nostr events, and fetched playlist bodies.

### Nodes

```ts
type BlobNode = {
  kind: 'blob';
  id: string;
  sha256?: string;
  url: string;
  mimeType?: string;
  size?: number;
  uploaded?: number;
};

type EventNode = {
  kind: 'event';
  id: string;
  eventId: string;
  eventKind: number;
  pubkey: string;
  createdAt: number;
  title?: string;
};

type PlaylistNode = {
  kind: 'playlist';
  id: string;
  url: string;
  sha256?: string;
  sourceBlobId?: string;
  parseState: 'pending' | 'parsed' | 'parse-failed' | 'truncated';
};

type SegmentNode = {
  kind: 'segment';
  id: string;
  url: string;
  sha256?: string;
  sourceBlobId?: string;
  isInit?: boolean;
  duration?: number;
};

type UnknownBucketNode = {
  kind: 'unknown-bucket';
  id: 'unreferenced' | 'ambiguous' | 'parse-failed' | 'external-only';
};
```

### Edges

Edges carry provenance so the UI can explain and gate actions.

```ts
type BlobGraphEdge = {
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
```

### Roots

- `EventNode`: an authored Nostr event explains one logical media object.
- `PlaylistNode`: a playlist can be a root when no event explains it.
- Unknown root: contains internal buckets:
  - `unreferenced`: no event and no playlist parent;
  - `ambiguous`: multiple plausible parents;
  - `parse-failed`: strong playlist signal, but fetch/parse failed;
  - `external-only`: referenced URL exists, but no local blob match.

## Event Scope

v1 fetches relevant events authored by the active profile:

- file metadata: kind `1063`;
- Blossom drive: kind `30563`;
- social post: kind `1`;
- picture: kind `20`;
- video: kinds `21`, `22`, `34235`, `34236`;
- audio: kind `31337`.

This matches the current `useFileMetaEvents` scope and adds the relationship tree on top of the same source model.

Future global search adds separate event sources such as contributed variants or reverse relay searches. Those sources append nodes/edges with their own provenance. They do not replace the active-profile source.

## Extraction Pipeline

1. Load `BlobDescriptor[]` from the selected Blossom server.
2. Load active user relays and authored events through the existing Nostr hook pattern.
3. Extract references from each event:
   - `x` tags;
   - `url`, `image`, `thumb` tags;
   - `imeta` fields: `url`, `x`, `m`, `image`, `fallback`, `mirror`;
   - `text-track` tags;
   - hashes embedded in content URLs.
4. Match extracted references to server blobs:
   - primary: hash match against `blob.sha256`;
   - secondary: exact URL match against `blob.url`;
   - if a URL embeds a Blossom hash, also try hash match;
   - external URLs remain visible but are not actionable as local blobs.
5. Detect playlist candidates.
6. Fetch and parse bounded playlist trees.
7. Build roots and buckets.
8. Derive action eligibility from provenance.

## Playlist Detection and Parsing

Playlist detection must not rely on `.m3u8` URLs. Some Blossom servers store playlists as `text/plain` or with generic/unknown MIME types.

Candidate signals:

- MIME `application/vnd.apple.mpegurl`;
- MIME `application/x-mpegurl`;
- MIME `audio/mpegurl` or `audio/x-mpegurl`;
- MIME declared in `imeta m ...`;
- URL or filename ending in `.m3u8` as a weak signal only;
- `text/plain` or unknown MIME when the blob is small enough to sniff.

Content sniffing decides whether a fetched body is a playlist:

- ignore BOM and leading whitespace;
- body starts with `#EXTM3U`;
- HLS tags such as `#EXT-X-STREAM-INF`, `#EXTINF`, or `#EXT-X-MAP` confirm HLS structure.

Parsing rules:

- master playlists: parse `#EXT-X-STREAM-INF` and resolve the following URI;
- media playlists: parse `#EXTINF` segment URIs;
- init segments: parse `#EXT-X-MAP:URI="..."`;
- resolve relative URIs with `new URL(child, parent)`;
- nested playlist URLs become `PlaylistNode`s;
- media/init URLs become `SegmentNode`s and match local blobs if possible.

Bounded eager constraints:

- limit concurrent playlist fetches;
- limit recursion depth;
- limit total playlist descendants per root;
- mark exceeded nodes as `truncated`;
- mark fetch/parse failures as `parse-failed`.

## UI

Add a new `Relationships` mode to `BlobListTypeMenu`.

The mode renders root cards:

- Event card: title, kind, date, short event hash, local blob count, status;
- Playlist card: URL/hash, child counts, parse status;
- Unknown card: collapsible `unreferenced`, `ambiguous`, `parse-failed`, and `external-only` buckets.

Each root card contains tree rows for:

- video variants;
- thumbnails/posters/grids;
- text tracks;
- playlists;
- init and media segments;
- external URL nodes.

Rows show:

- MIME icon;
- short hash or filename;
- size;
- server distribution warning when available;
- provenance badges such as `hash`, `url`, `event`, `playlist`;
- parse/fetch state.

## Actions and Safety

Group selection chooses only local `BlobNode`s with unambiguous provenance.

Group Delete/Mirror/Sync is enabled only when:

- every action target is a local server blob;
- every target has exactly one selected parent relationship;
- no target belongs to `ambiguous`, `parse-failed`, or `external-only` buckets;
- playlist parsing for the selected group did not truncate required descendants.

Unknown buckets are inspect/select-only for bulk actions. Manual single-blob selection remains possible where the existing BlobList behavior permits it.

Playlist group deletion shows an explicit warning: the subtree includes parsed playlist descendants and segment blobs.

Parser failures block group delete. They do not block mirror/sync for already matched, unambiguous blob nodes.

## Failure States

- Relays not ready: Relationships mode shows loading/disabled state.
- Event fetch returns no events: show playlist roots and Unknown buckets derived from server blobs.
- Playlist fetch blocked by CORS/network: mark `parse-failed`.
- Playlist body is not HLS after sniffing: treat it as a normal blob.
- Depth/descendant limit exceeded: mark `truncated` and gate destructive group actions.
- Multiple possible parents: bucket as `ambiguous` and disable bulk destructive actions.

## Non-goals for v1

- No hosted database.
- No persisted client-side graph database.
- No global relay search in v1.
- No canvas/node-link graph explorer.
- No automatic deletion of unknown or ambiguous groups.

## Open Extension Points

- Global search source: append non-authored events with provenance.
- Contributed variant source: group variants that reference existing event roots.
- Rich graph explorer: reuse the same graph index later if needed.
- Lazy node refresh: expand a truncated or failed playlist manually.
