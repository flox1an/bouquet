import type { NostrEvent } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { Catalog, type CatalogServerType } from './catalog';
import { extractTimelineEventMetadata, type TimelineEventMetadata } from './timelineMetadata';
import { EVENT_EXTRACTOR_VERSION } from './eventReferences';
import { isGenericMimeType } from '../utils/mimeTypes';
import {
  nextCheckAtFrom,
  stateFromHttpStatus,
  type BlobLocation,
  type BlobLocationHistory,
  type ReplicaState,
} from './replica';
export type { ReplicaState };
export type CatalogAction = 'mirror' | 'sync' | 'delete';

type Membership = { pubkey: string; sha256: string; status: 'active' | 'unresolved' | 'forgotten' };
type ProfileServer = { pubkey: string; serverId: string; enabled: boolean };
type Server = { serverId: string; baseUrl: string; serverType: CatalogServerType };
type ProfileEvent = { pubkey: string; eventId: string };
type CatalogEvent = { eventId: string; event: NostrEvent };
type TimelineEvent = TimelineEventMetadata & { id: string; pubkey: string };
type EventReference = { eventId: string; sha256?: string; role: string; extractorVersion?: number };
type Blob = {
  sha256: string;
  verifiedSize?: number;
  verifiedMimeType?: string;
  uploadedAt?: number;
  firstSeenAt: number;
};
type BlobUrl = { sha256?: string; url: string; sourceType?: string };
type MetadataFact = { subjectId: string; namespace: string; field: string; value: string | number };
type Asset = {
  id: string;
  pubkey: string;
  identityType: 'addressable-event' | 'immutable-event' | 'root-blob';
  identityValue: string;
  assetType: 'image' | 'video' | 'audio' | 'document' | 'unknown';
  state: 'active' | 'incomplete' | 'ambiguous';
  firstSeenAt: number;
  lastProjectedAt: number;
};
type AssetBlob = { id: string; assetId: string; sha256: string; role: string; ordinal: number };
type Relationship = {
  fromSha256: string;
  toSha256?: string;
  type: string;
  state: 'active' | 'unresolved' | 'failed' | 'truncated';
};
export type TimelineProjection = {
  id: string;
  pubkey: string;
  assetId: string;
  eventId?: string;
  eventKind?: number;
  eventAuthor?: string;
  eventAddress?: string;
  displayType: Asset['assetType'];
  displayTitle: string;
  displayTitleIsFallback: boolean;
  displaySubtitle?: string;
  /** Short human label for what the file is: "MP4 video", "HLS video", "Unclassified file". */
  displayKindLabel: string;
  /** Best-known mime type: sniffed content beats the server's claim beats the extension. */
  displayMimeType?: string;
  /** Playing time in seconds, currently only known for HLS playlists. */
  displayDurationSeconds?: number;
  /** "1920×1080", from sniffed image headers or the event's `dim` tag. */
  displayDimensions?: string;
  /** How many of `blobCount` are HLS segments rather than things a user picked. */
  segmentCount?: number;
  searchText: string;
  displayDate: number;
  displayDateSource: 'event' | 'blob-uploaded' | 'first-seen';
  primaryBlobSha256?: string;
  primaryUrl?: string;
  previewBlobSha256?: string;
  previewUrl?: string;
  blobCount: number;
  totalBlobSize: number;
  unknownBlobSizeCount: number;
  replicaCount: number;
  availabilityState: 'complete' | 'partial' | 'unavailable' | 'unknown';
  metadataCompleteness: 'pending' | 'complete' | 'failed';
  /** Start of the projection run that wrote this record; see `queryCatalogTimeline`. */
  projectedAt: number;
};
export type TimelineSortField = 'date' | 'title' | 'size' | 'blobCount' | 'replicaCount';
export type TimelineSort = { field: TimelineSortField; direction: 'asc' | 'desc' };
export type TimelineQuery = {
  types?: TimelineProjection['displayType'][];
  search?: string;
  serverId?: string;
  availability?: TimelineProjection['availabilityState'][];
  sort?: TimelineSort;
};
export type TimelineAssetBlob = {
  sha256: string;
  role: string;
  ordinal: number;
  mimeType?: string;
  eventMimeType?: string;
  dimensions?: string;
  size?: number;
  urls: string[];
  replicaCount: number;
  availabilityState: TimelineProjection['availabilityState'];
};
export type TimelineAssetDetail = { projection: TimelineProjection; blobs: TimelineAssetBlob[]; event?: NostrEvent };

/**
 * A search term is treated as a sha256 prefix once it is unambiguously hex and long
 * enough to be selective. Browse and `queryCatalogTimeline` must agree on this rule,
 * so both import it from here rather than repeating the pattern.
 */
export function isHashSearchTerm(term: string): boolean {
  return /^[0-9a-f]{8,}$/.test(term);
}

export function splitSearchTerms(search: string | undefined): string[] {
  return search?.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean) ?? [];
}

export type ReplicaProbe = (
  server: { id: string; baseUrl: string },
  sha256: string
) => Promise<{ status: number; size?: number; mimeType?: string; url?: string }>;
export type NativeUrlProbe = (
  url: string
) => Promise<{ status: number; size?: number; mimeType?: string; url?: string }>;

const stateFromStatus = stateFromHttpStatus;

function assetTypeFromEvent(event: Pick<NostrEvent, 'kind'>): Asset['assetType'] {
  if (event.kind === 20) return 'image';
  if (event.kind === 21 || event.kind === 22 || event.kind === 34235 || event.kind === 34236) return 'video';
  if (event.kind === 31337) return 'audio';
  if ([1063, 30563, 15128, 34128, 35128, 5128].includes(event.kind)) return 'document';
  return 'unknown';
}

function assetTypeFromMime(mimeType: string | undefined): Asset['assetType'] {
  const mime = mimeType?.split(';', 1)[0]?.trim().toLocaleLowerCase();
  if (!mime) return 'unknown';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/') || mime === 'application/vnd.apple.mpegurl') return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf' || mime.startsWith('text/') || mime.startsWith('application/vnd.')) return 'document';
  return 'unknown';
}

/**
 * Blossom servers hand out `application/octet-stream` for roughly half of a real
 * catalog (3 726 of 6 707 blobs in the case that prompted this), so the reported
 * mime alone leaves thousands of items typed `unknown` with no icon and no
 * thumbnail. The URL extension is weaker evidence but nearly always present, and
 * a sniffed content header - when one has been fetched - beats both. Which mimes
 * count as saying nothing lives in `utils/mimeTypes`, shared with the store.
 */

const NON_FORMAT_EXTENSIONS: Record<string, true> = { bin: true, data: true, blob: true, tmp: true, dat: true };

const EXTENSION_MIME_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  m4s: 'video/iso.segment',
  mov: 'video/quicktime',
  quicktime: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',
  ts: 'video/mp2t',
  m3u8: 'application/vnd.apple.mpegurl',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  wav: 'audio/wav',
  flac: 'audio/flac',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  pdf: 'application/pdf',
  vtt: 'text/vtt',
  srt: 'text/plain',
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/html',
  json: 'application/json',
  zip: 'application/zip',
};

/** Short, readable format name, preferring the extension over the mime subtype:
    `video/quicktime` reads as MOV, which is what the file is called everywhere else. */
const FORMAT_NAMES: Record<string, string> = {
  'video/mp4': 'MP4',
  'video/quicktime': 'MOV',
  'video/webm': 'WebM',
  'video/x-matroska': 'MKV',
  'video/mpeg': 'MPEG',
  'video/mp2t': 'MPEG-TS',
  'video/iso.segment': 'fMP4',
  'application/vnd.apple.mpegurl': 'HLS',
  'audio/mpeg': 'MP3',
  'audio/mp4': 'M4A',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'image/gif': 'GIF',
  'image/svg+xml': 'SVG',
  'application/pdf': 'PDF',
  'text/plain': 'Text',
  'text/vtt': 'Subtitles',
};

/** `https://host/<hash>.mp4;codecs=avc1` -> `mp4`. Blossom hosts append a
    mime-derived suffix, parameters and all, so the parameter is stripped too. */
export function extensionOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const name = url.split(/[?#]/, 1)[0].split('/').at(-1) ?? '';
  const dot = name.lastIndexOf('.');
  if (dot < 0) return undefined;
  const extension = name
    .slice(dot + 1)
    .split(';', 1)[0]
    .trim()
    .toLocaleLowerCase();
  return extension.length > 0 && extension.length <= 12 ? extension : undefined;
}

function isSpecificMime(mimeType: string | undefined): boolean {
  return !!mimeType && !isGenericMimeType(mimeType);
}

/** Sniffed header, then the server's claim, then the URL extension. A generic claim
    only wins when nothing better exists, so it never hides a real type. */
export function effectiveMimeType(candidates: {
  sniffed?: string;
  reported?: string;
  fromEvent?: string;
  url?: string;
}): string | undefined {
  const fromExtension = EXTENSION_MIME_TYPES[extensionOf(candidates.url) ?? ''];
  const ordered = [candidates.sniffed, candidates.reported, candidates.fromEvent, fromExtension];
  return ordered.find(isSpecificMime) ?? ordered.find(Boolean);
}

/** What the card says the thing is. Kept short: it sits on one line next to the size. */
export function mediaKindLabel(
  type: Asset['assetType'],
  mimeType: string | undefined,
  url: string | undefined,
  isHls: boolean
): string {
  if (isHls) return 'HLS video';
  const mime = mimeType?.split(';', 1)[0]?.trim().toLocaleLowerCase();
  const extension = extensionOf(url);
  const extensionMime = extension ? EXTENSION_MIME_TYPES[extension] : undefined;
  const format =
    (mime ? FORMAT_NAMES[mime] : undefined) ??
    (extensionMime ? FORMAT_NAMES[extensionMime] : undefined) ??
    // An extension nobody maps is still worth showing when it looks like a format
    // ("aaf") and not like a placeholder the host invented ("bin", "octet-stream").
    (extension && /^[a-z0-9]{2,5}$/.test(extension) && !NON_FORMAT_EXTENSIONS[extension]
      ? extension.toLocaleUpperCase()
      : undefined);
  if (type === 'unknown') return format ? `${format} file` : 'Unclassified file';
  return format ? `${format} ${type}` : `${type[0].toLocaleUpperCase()}${type.slice(1)}`;
}

/** A file named after its own hash carries no information a human can use, so it is
    a fallback title, not a title - the card then leads with the kind label instead. */
export function isHashLikeFileName(fileName: string | undefined): boolean {
  return !!fileName && /^[0-9a-f]{32,64}(\.[^.]*)?$/i.test(fileName);
}

export async function refreshReplicaAvailability(
  catalog: Catalog,
  pubkey: string,
  probe: ReplicaProbe,
  maxChecks = 100,
  hashes?: string[],
  onCheck?: (sha256: string, serverId: string, state: ReplicaState, httpStatus?: number) => void
): Promise<void> {
  const [memberships, profileServers, servers, locations] = await Promise.all([
    Catalog.storeFor(catalog).getAll<Membership>('profile_blob_membership'),
    Catalog.storeFor(catalog).getAll<ProfileServer>('profile_server'),
    Catalog.storeFor(catalog).getAll<Server>('server'),
    Catalog.storeFor(catalog).getAll<BlobLocation>('blob_location'),
  ]);
  const activeHashes =
    hashes ?? memberships.filter(item => item.pubkey === pubkey && item.status === 'active').map(item => item.sha256);
  const enabledServers = profileServers
    .filter(item => item.pubkey === pubkey && item.enabled)
    .flatMap(item => servers.filter(server => server.serverId === item.serverId));
  let checks = 0;
  for (const sha256 of activeHashes) {
    for (const server of enabledServers) {
      if (checks >= maxChecks) return;
      checks += 1;
      const id = `${sha256}:${server.serverId}`;
      const previous = locations.find(location => location.id === id);
      const observedAt = Date.now();
      let observed: { status: number; size?: number; mimeType?: string; url?: string } | undefined;
      let state: ReplicaState;
      let reason: string | undefined;
      try {
        observed = await probe({ id: server.serverId, baseUrl: server.baseUrl }, sha256);
        state = stateFromStatus(observed.status);
      } catch (error) {
        state = 'unreachable';
        reason = error instanceof Error ? error.message : String(error);
      }
      const isPresent = state === 'present';
      const failures = isPresent ? 0 : (previous?.consecutiveFailures ?? 0) + 1;
      const nextCheckAt = nextCheckAtFrom(observedAt, state, failures);
      const location: BlobLocation = {
        id,
        sha256,
        serverId: server.serverId,
        state,
        firstPresentAt: isPresent ? (previous?.firstPresentAt ?? observedAt) : previous?.firstPresentAt,
        lastPresentAt: isPresent ? observedAt : previous?.lastPresentAt,
        lastCheckedAt: observedAt,
        nextCheckAt,
        reportedSize: observed?.size,
        reportedMimeType: observed?.mimeType,
        canonicalUrl: observed?.url ?? `${server.baseUrl}/${sha256}`,
        source: 'replica',
        consecutiveFailures: failures,
      };
      await Catalog.storeFor(catalog).put<BlobLocation>('blob_location', location);
      onCheck?.(sha256, server.serverId, state, observed?.status);
      const changed =
        previous?.state !== state ||
        previous?.reportedSize !== location.reportedSize ||
        previous?.reportedMimeType !== location.reportedMimeType;
      if (changed) {
        await Catalog.storeFor(catalog).put<BlobLocationHistory>('blob_location_history', {
          id: `${id}:${observedAt}:${previous?.state ?? 'none'}:${state}`,
          sha256,
          serverId: server.serverId,
          observedAt,
          previousState: previous?.state,
          newState: state,
          httpStatus: observed?.status,
          reason,
          reportedSize: location.reportedSize,
          reportedMimeType: location.reportedMimeType,
        });
        if (state === 'present') await catalog.updateBlobServerMetadata(sha256, observed?.size, observed?.mimeType);
      }
    }
  }
}
export async function refreshEventUrlAvailability(
  catalog: Catalog,
  pubkey: string,
  probe: NativeUrlProbe,
  maxChecks = 100,
  hashes?: string[]
): Promise<void> {
  const [memberships, blobUrls, locations] = await Promise.all([
    Catalog.storeFor(catalog).getAll<Membership>('profile_blob_membership'),
    Catalog.storeFor(catalog).getAll<BlobUrl>('blob_url'),
    Catalog.storeFor(catalog).getAll<BlobLocation>('blob_location'),
  ]);
  const activeHashes = new Set(
    hashes ?? memberships.filter(item => item.pubkey === pubkey && item.status === 'active').map(item => item.sha256)
  );
  const seen = new Set<string>();
  let checks = 0;
  for (const blobUrl of blobUrls) {
    if (
      !blobUrl.sha256 ||
      !activeHashes.has(blobUrl.sha256) ||
      blobUrl.sourceType !== 'event' ||
      !/^https?:\/\//.test(blobUrl.url)
    ) {
      continue;
    }
    const id = `${blobUrl.sha256}:native-url:${blobUrl.url}`;
    if (seen.has(id)) continue;
    seen.add(id);
    if (checks >= maxChecks) return;
    checks += 1;
    const previous = locations.find(location => location.id === id);
    const observedAt = Date.now();
    let observed: { status: number; size?: number; mimeType?: string; url?: string } | undefined;
    let state: ReplicaState;
    let reason: string | undefined;
    try {
      observed = await probe(blobUrl.url);
      state = stateFromStatus(observed.status);
    } catch (error) {
      state = 'unreachable';
      reason = error instanceof Error ? error.message : String(error);
    }
    const isPresent = state === 'present';
    const failures = isPresent ? 0 : (previous?.consecutiveFailures ?? 0) + 1;
    const nextCheckAt = nextCheckAtFrom(observedAt, state, failures);
    const location: BlobLocation = {
      id,
      sha256: blobUrl.sha256,
      serverId: blobUrl.url,
      source: 'native-url',
      state,
      firstPresentAt: isPresent ? (previous?.firstPresentAt ?? observedAt) : previous?.firstPresentAt,
      lastPresentAt: isPresent ? observedAt : previous?.lastPresentAt,
      lastCheckedAt: observedAt,
      nextCheckAt,
      reportedSize: observed?.size,
      canonicalUrl: observed?.url ?? blobUrl.url,
      consecutiveFailures: failures,
    };
    await Catalog.storeFor(catalog).put<BlobLocation>('blob_location', location);
    const changed =
      previous?.state !== state ||
      previous?.reportedSize !== location.reportedSize ||
      previous?.reportedMimeType !== location.reportedMimeType;
    if (changed) {
      await Catalog.storeFor(catalog).put<BlobLocationHistory>('blob_location_history', {
        id: `${id}:${observedAt}:${previous?.state ?? 'none'}:${state}`,
        sha256: blobUrl.sha256,
        serverId: blobUrl.url,
        observedAt,
        previousState: previous?.state,
        newState: state,
        httpStatus: observed?.status,
        reason,
        reportedSize: location.reportedSize,
        reportedMimeType: location.reportedMimeType,
      });
    }
  }
}

export async function projectCatalogAssets(
  catalog: Catalog,
  pubkey: string,
  options?: { force?: boolean }
): Promise<void> {
  if (!options?.force && !(await catalog.isProjectionStale(pubkey))) return;
  // Taken before any read: a mutation landing during the run must still count as
  // newer than this projection, or its changes would be treated as already applied.
  // Strictly greater than the previous stamp, not just Date.now(): two projection
  // runs landing in the same millisecond (a delete or mirror can trigger one right
  // after another) would otherwise both write rows the query's `projectedAt >=
  // stamp` filter can't tell apart, resurrecting the run being replaced.
  const runStamp = Math.max(Date.now(), (await catalog.getProjectionStamp(pubkey)) + 1);
  const [
    memberships,
    profileEvents,
    cachedTimelineEvents,
    references,
    locations,
    relationships,
    blobs,
    blobUrls,
    metadataFacts,
  ] = await Promise.all([
    Catalog.storeFor(catalog).getAll<Membership>('profile_blob_membership'),
    Catalog.storeFor(catalog).getAll<ProfileEvent>('profile_event'),
    Catalog.storeFor(catalog).getAll<TimelineEvent>('timeline_event'),
    Catalog.storeFor(catalog).getAll<EventReference>('event_reference'),
    Catalog.storeFor(catalog).getAll<BlobLocation>('blob_location'),
    Catalog.storeFor(catalog).getAll<Relationship>('blob_relationship'),
    Catalog.storeFor(catalog).getAll<Blob>('blob'),
    Catalog.storeFor(catalog).getAll<BlobUrl>('blob_url'),
    Catalog.storeFor(catalog).getAll<MetadataFact>('metadata_fact'),
  ]);
  const profileTimelineEvents = await hydrateTimelineEvents(catalog, pubkey, profileEvents, cachedTimelineEvents);
  const activeHashes = new Set(
    memberships.filter(item => item.pubkey === pubkey && item.status === 'active').map(item => item.sha256)
  );
  const referencesByEvent = Map.groupBy(
    references.filter(
      item => item.extractorVersion === EVENT_EXTRACTOR_VERSION && item.sha256 && activeHashes.has(item.sha256)
    ),
    item => item.eventId
  );
  const blobsByHash = new Map(blobs.map(blob => [blob.sha256, blob]));
  const urlsByHash = Map.groupBy(
    blobUrls.filter(url => url.sha256),
    url => url.sha256!
  );
  const audioFactsByHash = Map.groupBy(
    metadataFacts.filter(fact => fact.namespace === 'audio'),
    fact => fact.subjectId
  );
  // Everything except audio tags: sniffed mime, image dimensions, playlist duration
  // and the mime/dim an event declared. One pass, then a per-hash lookup.
  const mediaFactsByHash = Map.groupBy(
    metadataFacts.filter(fact => fact.namespace !== 'audio'),
    fact => fact.subjectId
  );
  const childrenByParent = Map.groupBy(
    relationships.filter(relationship => relationship.toSha256),
    relationship => relationship.fromSha256
  );
  // A truncated expansion still proves the parent is a playlist: the segments past
  // the cap were recorded, just not followed. Excluding them here used to leave the
  // largest videos - the ones that blow the 200-descendant cap - typed as loose files.
  const hlsPlaylistHashes = new Set(
    relationships
      .filter(
        relationship =>
          relationship.state !== 'failed' && ['playlist', 'segment', 'init-segment'].includes(relationship.type)
      )
      .map(relationship => relationship.fromSha256)
  );
  const segmentHashes = new Set(
    relationships
      .filter(relationship => relationship.toSha256 && relationship.type !== 'playlist')
      .map(relationship => relationship.toSha256!)
  );
  const assigned = new Set<string>();
  const assets: Asset[] = [];
  const assetBlobs: AssetBlob[] = [];
  const projections: TimelineProjection[] = [];
  for (const event of profileTimelineEvents) {
    const eventReferences = referencesByEvent.get(event.eventId) ?? [];
    const primary =
      eventReferences.find(item => item.role === 'main' || item.role === 'original')?.sha256 ??
      eventReferences[0]?.sha256;
    if (!primary) continue;
    const identityType: Asset['identityType'] = event.dTag ? 'addressable-event' : 'immutable-event';
    const identityValue = event.dTag ? `${event.kind}:${event.author}:${event.dTag}` : event.eventId;
    const assetId = `${pubkey}:${identityType}:${identityValue}`;
    const declaredType = assetTypeFromEvent(event);
    const isHls = hlsPlaylistHashes.has(primary);
    const primaryUrl = blobUrlFor(primary, urlsByHash);
    const facts = mediaFactsFor(primary, mediaFactsByHash);
    const mimeType = effectiveMimeType({
      sniffed: facts.sniffedMimeType,
      reported: blobsByHash.get(primary)?.verifiedMimeType,
      fromEvent: facts.eventMimeType,
      url: primaryUrl,
    });
    const inferredType = isHls ? 'video' : assetTypeFromMime(mimeType);
    const type =
      (declaredType === 'document' || declaredType === 'unknown') && inferredType !== 'unknown'
        ? inferredType
        : declaredType;
    const referencedHashes = uniqueHashes(eventReferences.map(reference => reference.sha256!));
    const blobHashes = uniqueHashes(
      referencedHashes.flatMap(hash =>
        hlsPlaylistHashes.has(hash) ? collectDescendants(hash, childrenByParent) : [hash]
      )
    );
    const preview = eventReferences.find(item => item.role === 'thumbnail' || item.role === 'image')?.sha256;
    const audioMetadata = type === 'audio' ? audioMetadataFor(primary, audioFactsByHash) : undefined;
    const kindLabel = mediaKindLabel(type, mimeType, primaryUrl, isHls);
    const titleIsFallback = !audioMetadata?.title && event.titleIsFallback;
    // "Video" from the kind table says less than "HLS video" or "MOV video" does.
    const title = audioMetadata?.title ?? (titleIsFallback ? kindLabel : event.title);
    const subtitle = audioMetadata ? (audioSubtitle(audioMetadata) ?? event.subtitle) : event.subtitle;
    const segmentCount = blobHashes.filter(hash => segmentHashes.has(hash)).length;
    assets.push({
      id: assetId,
      pubkey,
      identityType,
      identityValue,
      assetType: type,
      state: 'active',
      firstSeenAt: event.createdAt * 1000,
      lastProjectedAt: Date.now(),
    });
    for (const [ordinal, reference] of eventReferences.entries()) {
      const role =
        reference.sha256 === primary
          ? 'primary'
          : reference.role === 'thumbnail' || reference.role === 'image'
            ? 'thumbnail'
            : 'rendition';
      assetBlobs.push({
        id: `${assetId}:${reference.sha256}:${role}`,
        assetId,
        sha256: reference.sha256!,
        role,
        ordinal,
      });
      assigned.add(reference.sha256!);
    }
    for (const [ordinal, descendant] of blobHashes.filter(hash => !referencedHashes.includes(hash)).entries()) {
      assetBlobs.push({
        id: `${assetId}:${descendant}:rendition`,
        assetId,
        sha256: descendant,
        role: 'rendition',
        ordinal,
      });
      assigned.add(descendant);
    }
    const eventAddress = (() => {
      try {
        return event.dTag
          ? nip19.naddrEncode({ identifier: event.dTag, pubkey: event.author, kind: event.kind })
          : nip19.neventEncode({ id: event.eventId, kind: event.kind, author: event.author });
      } catch {
        return event.eventId;
      }
    })();
    writeProjection(
      projections,
      pubkey,
      assetId,
      type,
      event.createdAt * 1000,
      primary,
      preview,
      locations,
      {
        eventId: event.eventId,
        eventKind: event.kind,
        eventAuthor: event.author,
        eventAddress,
        title,
        titleIsFallback,
        subtitle,
        kindLabel,
        mimeType,
        durationSeconds:
          facts.durationSeconds ?? (isHls ? longestPlaylistDuration(blobHashes, mediaFactsByHash) : undefined),
        dimensions: facts.dimensions,
        segmentCount: segmentCount > 0 ? segmentCount : undefined,
        searchText: `${event.searchText} ${title} ${subtitle ?? ''} ${kindLabel} ${mimeType ?? ''}`.toLocaleLowerCase(),
        dateSource: 'event',
      },
      {
        primaryUrl,
        previewUrl: preview ? blobUrlFor(preview, urlsByHash) : undefined,
        blobHashes,
        blobsByHash,
      },
      runStamp
    );
  }

  const relationshipChildren = new Set(
    relationships.flatMap(relationship => (relationship.toSha256 ? [relationship.toSha256] : []))
  );
  const eventSourcedBlobs = new Set(
    blobUrls.filter(url => url.sha256 && url.sourceType === 'event').map(url => url.sha256!)
  );
  for (const sha256 of activeHashes) {
    if (assigned.has(sha256) || relationshipChildren.has(sha256) || eventSourcedBlobs.has(sha256)) continue;
    // No blob row means the file was deleted from its last server and purged -
    // the membership survives only so event assets can render it as unavailable,
    // it must not keep a standalone card in the timeline on its own.
    const blob = blobsByHash.get(sha256);
    if (!blob) continue;
    const isHls = hlsPlaylistHashes.has(sha256);
    const primaryUrl = blobUrlFor(sha256, urlsByHash);
    const facts = mediaFactsFor(sha256, mediaFactsByHash);
    const mimeType = effectiveMimeType({
      sniffed: facts.sniffedMimeType,
      reported: blob?.verifiedMimeType,
      fromEvent: facts.eventMimeType,
      url: primaryUrl,
    });
    const type = isHls ? 'video' : assetTypeFromMime(mimeType);
    const assetId = `${pubkey}:root-blob:${sha256}`;
    assets.push({
      id: assetId,
      pubkey,
      identityType: 'root-blob',
      identityValue: sha256,
      assetType: type,
      state: 'active',
      firstSeenAt: blob?.firstSeenAt ?? Date.now(),
      lastProjectedAt: Date.now(),
    });
    assetBlobs.push({
      id: `${assetId}:${sha256}:primary`,
      assetId,
      sha256,
      role: 'primary',
      ordinal: 0,
    });
    const attachedHashes = collectDescendants(sha256, childrenByParent);
    for (const [ordinal, descendant] of attachedHashes.entries()) {
      if (descendant === sha256) continue;
      assetBlobs.push({
        id: `${assetId}:${descendant}:rendition`,
        assetId,
        sha256: descendant,
        role: 'rendition',
        ordinal,
      });
    }
    const displayDate = blob?.uploadedAt ?? blob?.firstSeenAt ?? Date.now();
    const displayDateSource: TimelineProjection['displayDateSource'] = blob?.uploadedAt
      ? 'blob-uploaded'
      : 'first-seen';
    const audioMetadata = type === 'audio' ? audioMetadataFor(sha256, audioFactsByHash) : undefined;
    const fileName = fileNameFromUrl(primaryUrl);
    const kindLabel = mediaKindLabel(type, mimeType, primaryUrl, isHls);
    // Blossom URLs are the file's own hash, so `<hash>.mp4` is not a name a person
    // chose - it reads as noise on every card. The kind label carries more meaning,
    // and the card still shows a short hash for identification.
    const namedByHash = isHashLikeFileName(fileName);
    const titleIsFallback = !audioMetadata?.title && (!fileName || namedByHash);
    const title = audioMetadata?.title ?? (namedByHash || !fileName ? kindLabel : fileName);
    const subtitle = audioMetadata ? audioSubtitle(audioMetadata) : undefined;
    const blobHashes = uniqueHashes(attachedHashes);
    const segmentCount = blobHashes.filter(hash => segmentHashes.has(hash)).length;
    writeProjection(
      projections,
      pubkey,
      assetId,
      type,
      displayDate,
      sha256,
      undefined,
      locations,
      {
        title,
        titleIsFallback,
        subtitle,
        kindLabel,
        mimeType,
        durationSeconds:
          facts.durationSeconds ?? (isHls ? longestPlaylistDuration(blobHashes, mediaFactsByHash) : undefined),
        dimensions: facts.dimensions,
        segmentCount: segmentCount > 0 ? segmentCount : undefined,
        searchText:
          `${title} ${subtitle ?? ''} ${sha256} ${kindLabel} ${mimeType ?? ''} ${fileName ?? ''}`.toLocaleLowerCase(),
        dateSource: displayDateSource,
      },
      {
        primaryUrl,
        blobHashes,
        blobsByHash,
      },
      runStamp
    );
  }
  await flushWrites(catalog, { assets, assetBlobs, projections });
  await catalog.markProjectionComplete(pubkey, runStamp);
}

async function hydrateTimelineEvents(
  catalog: Catalog,
  pubkey: string,
  profileEvents: ProfileEvent[],
  cachedEvents: TimelineEvent[]
): Promise<TimelineEvent[]> {
  const cachedByEventId = new Map(
    cachedEvents.filter(event => event.pubkey === pubkey).map(event => [event.eventId, event])
  );
  const missingEventIds = profileEvents
    .filter(event => event.pubkey === pubkey && !cachedByEventId.has(event.eventId))
    .map(event => event.eventId);
  if (missingEventIds.length === 0) return [...cachedByEventId.values()];

  const rawByEventId = new Map(
    (await Catalog.storeFor(catalog).getAll<CatalogEvent>('catalog_event')).map(event => [event.eventId, event.event])
  );
  for (const eventId of missingEventIds) {
    const raw = rawByEventId.get(eventId);
    if (!raw) continue;
    const metadata = extractTimelineEventMetadata(raw);
    const cached = { id: `${pubkey}:${eventId}`, pubkey, ...metadata };
    await Catalog.storeFor(catalog).put<TimelineEvent>('timeline_event', cached);
    cachedByEventId.set(eventId, cached);
  }
  return [...cachedByEventId.values()];
}

function fileNameFromUrl(value: string | undefined): string | undefined {
  if (!value) return;
  const fileName = new URL(value).pathname.split('/').at(-1);
  return fileName && fileName.length < 160 ? decodeURIComponent(fileName) : undefined;
}

type AudioMetadata = { title?: string; artist?: string; album?: string; year?: string };

function audioMetadataFor(sha256: string, factsByHash: Map<string, MetadataFact[]>): AudioMetadata {
  const facts = factsByHash.get(sha256) ?? [];
  const value = (field: keyof AudioMetadata) => {
    const fact = facts.find(item => item.field === field);
    return typeof fact?.value === 'string' && fact.value.trim() ? fact.value : undefined;
  };
  return { title: value('title'), artist: value('artist'), album: value('album'), year: value('year') };
}

function audioSubtitle(metadata: AudioMetadata): string | undefined {
  const album = metadata.album && `${metadata.album}${metadata.year ? ` (${metadata.year})` : ''}`;
  return [metadata.artist, album].filter(Boolean).join(' · ') || undefined;
}

type MediaFacts = {
  sniffedMimeType?: string;
  eventMimeType?: string;
  dimensions?: string;
  durationSeconds?: number;
};

/** Facts a card can show without another fetch: sniffed mime, declared mime, pixel
    size, and the summed `#EXTINF` duration of an HLS playlist. */
function mediaFactsFor(sha256: string, factsByHash: Map<string, MetadataFact[]>): MediaFacts {
  const facts = factsByHash.get(sha256);
  if (!facts) return {};
  const find = (namespace: string, field: string) =>
    facts.find(fact => fact.namespace === namespace && fact.field === field)?.value;
  const text = (value: string | number | undefined) =>
    typeof value === 'string' && value.trim() ? value.trim() : undefined;
  const width = find('image', 'width');
  const height = find('image', 'height');
  const duration = find('playlist', 'duration');
  return {
    sniffedMimeType: text(find('common', 'mime_type')),
    eventMimeType: text(find('event', 'mime_type')),
    dimensions:
      typeof width === 'number' && typeof height === 'number'
        ? `${width}×${height}`
        : text(find('event', 'dimensions'))?.replace('x', '×'),
    durationSeconds: typeof duration === 'number' && duration > 0 ? Math.round(duration) : undefined,
  };
}

/** A master playlist carries no `#EXTINF` of its own - the running time lives on the
    variant playlists below it, and every variant describes the same content, so the
    longest one is the item's duration rather than their sum. */
function longestPlaylistDuration(hashes: string[], factsByHash: Map<string, MetadataFact[]>): number | undefined {
  let longest = 0;
  for (const hash of hashes) {
    const duration = mediaFactsFor(hash, factsByHash).durationSeconds ?? 0;
    if (duration > longest) longest = duration;
  }
  return longest > 0 ? longest : undefined;
}

function collectDescendants(root: string, childrenByParent: Map<string, Relationship[]>): string[] {
  const result: string[] = [root];
  const seen = new Set<string>([root]);
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of childrenByParent.get(current) ?? []) {
      if (!child.toSha256 || seen.has(child.toSha256)) continue;
      seen.add(child.toSha256);
      result.push(child.toSha256);
      queue.push(child.toSha256);
    }
  }
  return result;
}

function uniqueHashes(hashes: string[]): string[] {
  return [...new Set(hashes)];
}

function blobUrlFor(sha256: string, urlsByHash: Map<string, BlobUrl[]>): string | undefined {
  return urlsByHash.get(sha256)?.find(item => /^https?:\/\//.test(item.url))?.url;
}

function blobSummary(blobHashes: string[], blobsByHash: Map<string, Blob>) {
  const blobs = blobHashes.map(sha256 => blobsByHash.get(sha256));
  return {
    blobCount: blobHashes.length,
    totalBlobSize: blobs.reduce(
      (total, blob) => total + (blob?.verifiedSize && blob.verifiedSize > 0 ? blob.verifiedSize : 0),
      0
    ),
    unknownBlobSizeCount: blobs.filter(blob => !blob?.verifiedSize || blob.verifiedSize <= 0).length,
  };
}

/**
 * Chunked bulk write: one transaction per chunk keeps memory and lock time bounded.
 *
 * Assets and their blob lists are derived from evidence that rarely moves, so a
 * reprojection rewrote ~17 000 identical rows every time anything at all changed -
 * seconds of worker time per keystroke-sized event. Only rows that actually differ
 * are written; projections always are, because they carry the run stamp the timeline
 * query filters on.
 */
async function flushWrites(
  catalog: Catalog,
  writes: { assets: Asset[]; assetBlobs: AssetBlob[]; projections: TimelineProjection[] }
): Promise<void> {
  const chunk = 2000;
  const [storedAssets, storedAssetBlobs] = await Promise.all([
    Catalog.storeFor(catalog).getAll<Asset>('asset'),
    Catalog.storeFor(catalog).getAll<AssetBlob>('asset_blob'),
  ]);
  const assetsById = new Map(storedAssets.map(asset => [asset.id, asset]));
  const assetBlobsById = new Map(storedAssetBlobs.map(assetBlob => [assetBlob.id, assetBlob]));
  // `lastProjectedAt` is bookkeeping no reader consults, so it is deliberately left
  // out of the comparison - otherwise every row differs on every run.
  const changedAssets = writes.assets.filter(asset => {
    const stored = assetsById.get(asset.id);
    return (
      !stored ||
      stored.pubkey !== asset.pubkey ||
      stored.identityType !== asset.identityType ||
      stored.identityValue !== asset.identityValue ||
      stored.assetType !== asset.assetType ||
      stored.state !== asset.state ||
      stored.firstSeenAt !== asset.firstSeenAt
    );
  });
  const changedAssetBlobs = writes.assetBlobs.filter(assetBlob => {
    const stored = assetBlobsById.get(assetBlob.id);
    return (
      !stored ||
      stored.assetId !== assetBlob.assetId ||
      stored.sha256 !== assetBlob.sha256 ||
      stored.role !== assetBlob.role ||
      stored.ordinal !== assetBlob.ordinal
    );
  });
  for (let i = 0; i < changedAssets.length; i += chunk)
    await Catalog.storeFor(catalog).putMany('asset', changedAssets.slice(i, i + chunk));
  for (let i = 0; i < changedAssetBlobs.length; i += chunk)
    await Catalog.storeFor(catalog).putMany('asset_blob', changedAssetBlobs.slice(i, i + chunk));
  for (let i = 0; i < writes.projections.length; i += chunk)
    await Catalog.storeFor(catalog).putMany('timeline_projection', writes.projections.slice(i, i + chunk));
}

async function writeProjection(
  projections: TimelineProjection[],
  pubkey: string,
  assetId: string,
  displayType: Asset['assetType'],
  displayDate: number,
  primary: string,
  preview: string | undefined,
  locations: BlobLocation[],
  display: {
    eventId?: string;
    eventKind?: number;
    eventAuthor?: string;
    eventAddress?: string;
    title: string;
    titleIsFallback: boolean;
    subtitle?: string;
    kindLabel: string;
    mimeType?: string;
    durationSeconds?: number;
    dimensions?: string;
    segmentCount?: number;
    searchText: string;
    dateSource: TimelineProjection['displayDateSource'];
  },
  media: { primaryUrl?: string; previewUrl?: string; blobHashes: string[]; blobsByHash: Map<string, Blob> },
  projectedAt: number
) {
  const present = locations.filter(location => location.sha256 === primary && location.state === 'present');
  const known = locations.filter(location => location.sha256 === primary);
  const availabilityState: TimelineProjection['availabilityState'] =
    present.length > 0 ? 'complete' : known.length > 0 ? 'unavailable' : 'unknown';
  const summary = blobSummary(media.blobHashes, media.blobsByHash);
  projections.push({
    id: `${pubkey}:${assetId}`,
    pubkey,
    assetId,
    eventId: display.eventId,
    eventKind: display.eventKind,
    eventAuthor: display.eventAuthor,
    eventAddress: display.eventAddress,
    displayType,
    displayTitle: display.title,
    displayTitleIsFallback: display.titleIsFallback,
    displaySubtitle: display.subtitle,
    displayKindLabel: display.kindLabel,
    displayMimeType: display.mimeType,
    displayDurationSeconds: display.durationSeconds,
    displayDimensions: display.dimensions,
    segmentCount: display.segmentCount,
    searchText: display.searchText,
    displayDate,
    displayDateSource: display.dateSource,
    primaryBlobSha256: primary,
    previewBlobSha256: preview,
    primaryUrl: media.primaryUrl,
    previewUrl: media.previewUrl,
    ...summary,
    replicaCount: present.filter(location => location.source !== 'native-url').length,
    availabilityState,
    metadataCompleteness: display.eventId ? 'complete' : 'pending',
    projectedAt,
  });
}
export async function queryCatalogTimeline(
  catalog: Catalog,
  pubkey: string,
  query: TimelineQuery = {}
): Promise<TimelineProjection[]> {
  const stamp = await catalog.getProjectionStamp(pubkey);
  const searchTerms = splitSearchTerms(query.search);
  const hashTerms = searchTerms.filter(isHashSearchTerm);
  // Only the two selective filters pay for a join. A plain browse, a type filter and
  // a text search all answer from `timeline_projection` alone, which is what keeps
  // filtering off the multi-table read path.
  const [projections, assetBlobs] = await Promise.all([
    Catalog.storeFor(catalog).getAll<TimelineProjection>('timeline_projection'),
    hashTerms.length > 0 ? Catalog.storeFor(catalog).getAll<AssetBlob>('asset_blob') : Promise.resolve<AssetBlob[]>([]),
  ]);
  const assetBlobsByAssetId = Map.groupBy(assetBlobs, assetBlob => assetBlob.assetId);
  const matchesSearchTerm = (projection: TimelineProjection, term: string): boolean => {
    if (projection.searchText.includes(term)) return true;
    if (!isHashSearchTerm(term)) return false;
    return (assetBlobsByAssetId.get(projection.assetId) ?? []).some(assetBlob => assetBlob.sha256.startsWith(term));
  };

  let assetIdsOnServer: Set<string> | undefined;
  if (query.serverId) {
    assetIdsOnServer = new Set(await queryCatalogAssetIds(catalog, { serverId: query.serverId }));
  }

  const filtered = projections
    .filter(projection => projection.pubkey === pubkey)
    // Projections from an earlier run are leftovers: a blob that has since been
    // claimed by an event asset, or one that left the catalog entirely. The store
    // has no delete, so the run stamp is what separates them from the live set.
    .filter(projection => projection.projectedAt >= stamp)
    .filter(projection => !query.types || query.types.includes(projection.displayType))
    .filter(projection => !query.availability || query.availability.includes(projection.availabilityState))
    .filter(projection => !assetIdsOnServer || assetIdsOnServer.has(projection.assetId))
    .filter(projection => searchTerms.every(term => matchesSearchTerm(projection, term)));

  return sortTimelineProjections(filtered, query.sort);
}

/**
 * The two filters Browse cannot answer from the list it already holds: "present on
 * this server" and "contains this file hash". Both need nothing but asset ids, so
 * this reads `asset_blob` and returns ids instead of cloning every projection back
 * across the worker boundary - which is what a filter change used to pay for.
 *
 * Several hash terms narrow each other: an asset must carry a blob for each one.
 */
export async function queryCatalogAssetIds(
  catalog: Catalog,
  query: { serverId?: string; hashTerms?: string[] }
): Promise<string[]> {
  const hashTerms = query.hashTerms ?? [];
  if (!query.serverId && hashTerms.length === 0) return [];
  const [assetBlobs, presentLocations] = await Promise.all([
    Catalog.storeFor(catalog).getAll<AssetBlob>('asset_blob'),
    query.serverId
      ? Catalog.storeFor(catalog).getAllFromIndex<BlobLocation>('blob_location', 'by_server_state', [
          query.serverId,
          'present',
        ])
      : Promise.resolve<BlobLocation[]>([]),
  ]);
  let assetIds: Set<string> | undefined;
  const narrow = (keep: (assetBlob: AssetBlob) => boolean) => {
    const matched = new Set(assetBlobs.filter(keep).map(assetBlob => assetBlob.assetId));
    assetIds = assetIds === undefined ? matched : new Set([...assetIds].filter(id => matched.has(id)));
  };
  if (query.serverId) {
    const presentHashes = new Set(presentLocations.map(location => location.sha256));
    narrow(assetBlob => presentHashes.has(assetBlob.sha256));
  }
  // Hashes are stored lower-case, and `isHashSearchTerm` only accepts lower-case hex,
  // so the prefix test needs no case handling.
  for (const term of hashTerms) narrow(assetBlob => assetBlob.sha256.startsWith(term));
  return [...(assetIds ?? [])];
}

export function sortTimelineProjections(items: TimelineProjection[], sort?: TimelineSort): TimelineProjection[] {
  const field = sort?.field ?? 'date';
  const direction = sort?.direction ?? 'desc';
  const factor = direction === 'asc' ? 1 : -1;
  const compareByField: Record<TimelineSortField, (a: TimelineProjection, b: TimelineProjection) => number> = {
    date: (a, b) => a.displayDate - b.displayDate,
    title: (a, b) => a.displayTitle.localeCompare(b.displayTitle),
    size: (a, b) => a.totalBlobSize - b.totalBlobSize,
    blobCount: (a, b) => a.blobCount - b.blobCount,
    replicaCount: (a, b) => a.replicaCount - b.replicaCount,
  };
  const compare = compareByField[field];
  return [...items].sort((a, b) => factor * compare(a, b));
}

/**
 * Assembles one blob's row from records the caller has already fetched, so that the
 * whole-asset loader and the contents summary can disagree about what to fetch
 * without disagreeing about what a blob looks like.
 */
function toTimelineAssetBlob(
  assetBlob: AssetBlob,
  blob: Blob | undefined,
  urls: BlobUrl[],
  locations: BlobLocation[],
  eventFacts: MetadataFact[]
): TimelineAssetBlob {
  const present = locations.filter(location => location.state === 'present');
  return {
    sha256: assetBlob.sha256,
    role: assetBlob.role,
    ordinal: assetBlob.ordinal,
    mimeType: blob?.verifiedMimeType,
    eventMimeType: eventFacts.find(fact => fact.field === 'mime_type')?.value as string | undefined,
    dimensions: eventFacts.find(fact => fact.field === 'dimensions')?.value as string | undefined,
    size: blob?.verifiedSize,
    urls: [...new Set(urls.map(url => url.url))],
    replicaCount: present.filter(location => location.source !== 'native-url').length,
    availabilityState: present.length > 0 ? 'complete' : locations.length > 0 ? 'unavailable' : 'unknown',
  };
}

async function loadAssetBlobs(catalog: Catalog, assetBlobs: AssetBlob[]): Promise<TimelineAssetBlob[]> {
  return Promise.all(
    assetBlobs.map(async assetBlob => {
      const [blob, urls, locations, facts] = await Promise.all([
        Catalog.storeFor(catalog).get<Blob>('blob', assetBlob.sha256),
        Catalog.storeFor(catalog).getAllFromIndex<BlobUrl>('blob_url', 'by_sha256', assetBlob.sha256),
        Catalog.storeFor(catalog).getAllFromIndex<BlobLocation>('blob_location', 'by_sha256', assetBlob.sha256),
        Catalog.storeFor(catalog).getAllFromIndex<MetadataFact>('metadata_fact', 'by_subject', assetBlob.sha256),
      ]);
      return toTimelineAssetBlob(
        assetBlob,
        blob,
        urls,
        locations,
        facts.filter(fact => fact.namespace === 'event')
      );
    })
  );
}

async function assetBlobsInOrder(catalog: Catalog, assetId: string): Promise<AssetBlob[]> {
  const assetBlobs = await Catalog.storeFor(catalog).getAllFromIndex<AssetBlob>('asset_blob', 'by_asset', assetId);
  return assetBlobs.sort((a, b) => a.ordinal - b.ordinal);
}

export async function getCatalogTimelineAsset(
  catalog: Catalog,
  pubkey: string,
  assetId: string
): Promise<TimelineAssetDetail | undefined> {
  const projection = await Catalog.storeFor(catalog).get<TimelineProjection>(
    'timeline_projection',
    `${pubkey}:${assetId}`
  );
  if (!projection) return;
  const [blobs, catalogEvent] = await Promise.all([
    assetBlobsInOrder(catalog, assetId).then(assetBlobs => loadAssetBlobs(catalog, assetBlobs)),
    projection.eventId
      ? Catalog.storeFor(catalog).get<CatalogEvent>('catalog_event', projection.eventId)
      : Promise.resolve(undefined),
  ]);
  return { projection, event: catalogEvent?.event, blobs };
}

/**
 * What a browse row shows of an item's contents: the total file count, and detail for
 * only the first few. An HLS item can carry two hundred blobs, so loading them all to
 * render four would make scrolling cost grow with segment count.
 */
export type TimelineAssetContents = { totalCount: number; blobs: TimelineAssetBlob[] };

export async function getCatalogAssetContents(
  catalog: Catalog,
  assetId: string,
  limit: number
): Promise<TimelineAssetContents> {
  const assetBlobs = await assetBlobsInOrder(catalog, assetId);
  return { totalCount: assetBlobs.length, blobs: await loadAssetBlobs(catalog, assetBlobs.slice(0, limit)) };
}

export async function planCatalogAction(catalog: Catalog, pubkey: string, assetId: string, action: CatalogAction) {
  const [assets, assetBlobs, relationships, locations] = await Promise.all([
    Catalog.storeFor(catalog).getAll<Asset>('asset'),
    Catalog.storeFor(catalog).getAll<AssetBlob>('asset_blob'),
    Catalog.storeFor(catalog).getAll<{ fromSha256: string; state: 'active' | 'unresolved' | 'failed' | 'truncated' }>(
      'blob_relationship'
    ),
    Catalog.storeFor(catalog).getAll<BlobLocation>('blob_location'),
  ]);
  const asset = assets.find(item => item.id === assetId && item.pubkey === pubkey);
  if (!asset) return { allowed: false, reason: 'This item is not in your profile', targets: [] as string[] };
  const targets = assetBlobs.filter(item => item.assetId === assetId).map(item => item.sha256);
  const incomplete = relationships.some(
    relationship => targets.includes(relationship.fromSha256) && relationship.state !== 'active'
  );
  if (action === 'delete' && (asset.state !== 'active' || incomplete))
    return { allowed: false, reason: 'Delete requires a complete, unambiguous picture of this item', targets };
  const presentTargets = targets.filter(sha256 =>
    locations.some(
      location => location.sha256 === sha256 && location.state === 'present' && location.source !== 'native-url'
    )
  );
  if (action === 'mirror' && presentTargets.length === 0)
    return { allowed: false, reason: 'No server currently has a copy that can be transferred', targets };
  return { allowed: true, targets, presentTargets };
}

export type AssetReplica = {
  sha256: string;
  assetId: string;
  role: string;
  size?: number;
  sources: Array<{ serverId: string; baseUrl: string; serverType: CatalogServerType }>;
  presentOn: string[];
  absentFrom: Array<{ serverId: string; baseUrl: string }>;
};

export async function getAssetReplicaMap(catalog: Catalog, pubkey: string, assetId: string): Promise<AssetReplica[]> {
  const [assetBlobs, locations, servers, profileServers, blobs] = await Promise.all([
    Catalog.storeFor(catalog).getAll<AssetBlob>('asset_blob'),
    Catalog.storeFor(catalog).getAll<BlobLocation>('blob_location'),
    Catalog.storeFor(catalog).getAll<Server>('server'),
    Catalog.storeFor(catalog).getAll<ProfileServer>('profile_server'),
    Catalog.storeFor(catalog).getAll<Blob>('blob'),
  ]);
  const serversById = new Map(servers.map(server => [server.serverId, server]));
  const enabledServers = profileServers
    .filter(item => item.pubkey === pubkey && item.enabled)
    .flatMap(item => serversById.get(item.serverId) ?? []);
  const blobsByHash = new Map(blobs.map(blob => [blob.sha256, blob]));
  return assetBlobs
    .filter(item => item.assetId === assetId)
    .sort((a, b) => a.ordinal - b.ordinal)
    .map(assetBlob => {
      const blobLocations = locations.filter(location => location.sha256 === assetBlob.sha256);
      const presentOn = [
        ...new Set(blobLocations.filter(location => location.state === 'present').map(location => location.serverId)),
      ];
      const sources = [
        ...new Map(
          blobLocations
            .filter(location => location.state === 'present' && location.source !== 'native-url')
            .flatMap(location => {
              const server = serversById.get(location.serverId);
              return server
                ? [
                    [
                      server.serverId,
                      { serverId: server.serverId, baseUrl: server.baseUrl, serverType: server.serverType },
                    ] as const,
                  ]
                : [];
            })
        ).values(),
      ];
      return {
        sha256: assetBlob.sha256,
        assetId: assetBlob.assetId,
        role: assetBlob.role,
        size: blobsByHash.get(assetBlob.sha256)?.verifiedSize,
        sources,
        presentOn,
        absentFrom: enabledServers
          .filter(server => !presentOn.includes(server.serverId))
          .map(server => ({ serverId: server.serverId, baseUrl: server.baseUrl })),
      };
    });
}

export type ReplicaOp = {
  sha256: string;
  assetId: string;
  sourceBaseUrl: string;
  targetServerId: string;
  targetBaseUrl: string;
};

/**
 * Mirror when `targetServerId` is given, sync across every enabled server when it
 * is not. A blob with no usable source, or one already present on a target, yields
 * no op - which is what makes re-running after a cancelled run cheap.
 */
export function buildReplicaOps(replicaMap: AssetReplica[], targetServerId?: string): ReplicaOp[] {
  return replicaMap.flatMap(replica => {
    const source = [...replica.sources].sort((a, b) => a.serverId.localeCompare(b.serverId))[0];
    if (!source) return [];
    return replica.absentFrom
      .filter(target => !targetServerId || target.serverId === targetServerId)
      .map(target => ({
        sha256: replica.sha256,
        assetId: replica.assetId,
        sourceBaseUrl: source.baseUrl,
        targetServerId: target.serverId,
        targetBaseUrl: target.baseUrl,
      }));
  });
}
