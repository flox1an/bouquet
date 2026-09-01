import type { NostrEvent } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import type { Catalog, CatalogServerType } from './catalog';
import { extractTimelineEventMetadata, type TimelineEventMetadata } from './timelineMetadata';
import { EVENT_EXTRACTOR_VERSION } from './eventReferences';

export type ReplicaState = 'present' | 'absent' | 'unauthorized' | 'rate_limited' | 'unreachable' | 'unknown';
export type CatalogAction = 'mirror' | 'sync' | 'delete';

type Membership = { pubkey: string; sha256: string; status: 'active' | 'unresolved' | 'forgotten' };
type ProfileServer = { pubkey: string; serverId: string; enabled: boolean };
type Server = { serverId: string; baseUrl: string; serverType: CatalogServerType };
type BlobLocation = {
  id: string;
  sha256: string;
  serverId: string;
  state: ReplicaState;
  firstPresentAt?: number;
  lastPresentAt?: number;
  lastCheckedAt: number;
  nextCheckAt: number;
  reportedSize?: number;
  reportedMimeType?: string;
  canonicalUrl: string;
  consecutiveFailures: number;
  source?: 'replica' | 'native-url' | 'server-list';
};
type BlobLocationHistory = {
  id: string;
  sha256: string;
  serverId: string;
  observedAt: number;
  previousState?: ReplicaState;
  newState: ReplicaState;
  httpStatus?: number;
  reason?: string;
  reportedSize?: number;
  reportedMimeType?: string;
};
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

function stateFromStatus(status: number): ReplicaState {
  if (status >= 200 && status < 300) return 'present';
  if (status === 404 || status === 410) return 'absent';
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 429) return 'rate_limited';
  return 'unreachable';
}

function assetTypeFromEvent(event: Pick<NostrEvent, 'kind'>): Asset['assetType'] {
  if (event.kind === 20) return 'image';
  if (event.kind === 21 || event.kind === 22 || event.kind === 34235 || event.kind === 34236) return 'video';
  if (event.kind === 31337) return 'audio';
  if ([1063, 30563, 15128, 35128, 5128].includes(event.kind)) return 'document';
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

export async function refreshReplicaAvailability(
  catalog: Catalog,
  pubkey: string,
  probe: ReplicaProbe,
  maxChecks = 100,
  hashes?: string[],
  onCheck?: (sha256: string, serverId: string, state: ReplicaState, httpStatus?: number) => void
): Promise<void> {
  const [memberships, profileServers, servers, locations] = await Promise.all([
    catalog.store.getAll<Membership>('profile_blob_membership'),
    catalog.store.getAll<ProfileServer>('profile_server'),
    catalog.store.getAll<Server>('server'),
    catalog.store.getAll<BlobLocation>('blob_location'),
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
      const nextCheckAt =
        observedAt + (isPresent ? 24 * 60 * 60_000 : Math.min(60 * 60_000 * 2 ** failures, 24 * 60 * 60_000));
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
      await catalog.store.put<BlobLocation>('blob_location', location);
      onCheck?.(sha256, server.serverId, state, observed?.status);
      const changed =
        previous?.state !== state ||
        previous?.reportedSize !== location.reportedSize ||
        previous?.reportedMimeType !== location.reportedMimeType;
      if (changed) {
        await catalog.store.put<BlobLocationHistory>('blob_location_history', {
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
    catalog.store.getAll<Membership>('profile_blob_membership'),
    catalog.store.getAll<BlobUrl>('blob_url'),
    catalog.store.getAll<BlobLocation>('blob_location'),
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
    const location: BlobLocation = {
      id,
      sha256: blobUrl.sha256,
      serverId: blobUrl.url,
      source: 'native-url',
      state,
      firstPresentAt: isPresent ? (previous?.firstPresentAt ?? observedAt) : previous?.firstPresentAt,
      lastPresentAt: isPresent ? observedAt : previous?.lastPresentAt,
      lastCheckedAt: observedAt,
      nextCheckAt:
        observedAt + (isPresent ? 24 * 60 * 60_000 : Math.min(60 * 60_000 * 2 ** failures, 24 * 60 * 60_000)),
      reportedSize: observed?.size,
      canonicalUrl: observed?.url ?? blobUrl.url,
      consecutiveFailures: failures,
    };
    await catalog.store.put<BlobLocation>('blob_location', location);
    const changed =
      previous?.state !== state ||
      previous?.reportedSize !== location.reportedSize ||
      previous?.reportedMimeType !== location.reportedMimeType;
    if (changed) {
      await catalog.store.put<BlobLocationHistory>('blob_location_history', {
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
    catalog.store.getAll<Membership>('profile_blob_membership'),
    catalog.store.getAll<ProfileEvent>('profile_event'),
    catalog.store.getAll<TimelineEvent>('timeline_event'),
    catalog.store.getAll<EventReference>('event_reference'),
    catalog.store.getAll<BlobLocation>('blob_location'),
    catalog.store.getAll<Relationship>('blob_relationship'),
    catalog.store.getAll<Blob>('blob'),
    catalog.store.getAll<BlobUrl>('blob_url'),
    catalog.store.getAll<MetadataFact>('metadata_fact'),
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
  const childrenByParent = Map.groupBy(
    relationships.filter(relationship => relationship.toSha256),
    relationship => relationship.fromSha256
  );
  const hlsPlaylistHashes = new Set(
    relationships
      .filter(
        relationship =>
          relationship.state === 'active' && ['playlist', 'segment', 'init-segment'].includes(relationship.type)
      )
      .map(relationship => relationship.fromSha256)
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
    const inferredType = hlsPlaylistHashes.has(primary)
      ? 'video'
      : assetTypeFromMime(blobsByHash.get(primary)?.verifiedMimeType);
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
    const title = audioMetadata?.title ?? event.title;
    const subtitle = audioMetadata ? (audioSubtitle(audioMetadata) ?? event.subtitle) : event.subtitle;
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
        titleIsFallback: !audioMetadata?.title && event.titleIsFallback,
        subtitle,
        searchText: `${event.searchText} ${title} ${subtitle ?? ''}`.toLocaleLowerCase(),
        dateSource: 'event',
      },
      {
        primaryUrl: blobUrlFor(primary, urlsByHash),
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
    const blob = blobsByHash.get(sha256);
    const type = hlsPlaylistHashes.has(sha256) ? 'video' : assetTypeFromMime(blob?.verifiedMimeType);
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
    const fileName = fileNameFromUrl(urlsByHash.get(sha256)?.[0]?.url);
    const titleIsFallback = !audioMetadata?.title && !fileName;
    const title =
      audioMetadata?.title ??
      fileName ??
      (type === 'unknown' ? `Unclassified file ${sha256.slice(0, 8)}` : `${type[0].toUpperCase()}${type.slice(1)}`);
    const subtitle = audioMetadata ? audioSubtitle(audioMetadata) : undefined;
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
        searchText: `${title} ${subtitle ?? ''} ${sha256} ${blob?.verifiedMimeType ?? ''}`.toLocaleLowerCase(),
        dateSource: displayDateSource,
      },
      {
        primaryUrl: blobUrlFor(sha256, urlsByHash),
        blobHashes: uniqueHashes(attachedHashes),
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
    (await catalog.store.getAll<CatalogEvent>('catalog_event')).map(event => [event.eventId, event.event])
  );
  for (const eventId of missingEventIds) {
    const raw = rawByEventId.get(eventId);
    if (!raw) continue;
    const metadata = extractTimelineEventMetadata(raw);
    const cached = { id: `${pubkey}:${eventId}`, pubkey, ...metadata };
    await catalog.store.put<TimelineEvent>('timeline_event', cached);
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

/** Chunked bulk write: one transaction per chunk keeps memory and lock time bounded. */
async function flushWrites(
  catalog: Catalog,
  writes: { assets: Asset[]; assetBlobs: AssetBlob[]; projections: TimelineProjection[] }
): Promise<void> {
  const chunk = 2000;
  for (let i = 0; i < writes.assets.length; i += chunk)
    await catalog.store.putMany('asset', writes.assets.slice(i, i + chunk));
  for (let i = 0; i < writes.assetBlobs.length; i += chunk)
    await catalog.store.putMany('asset_blob', writes.assetBlobs.slice(i, i + chunk));
  for (let i = 0; i < writes.projections.length; i += chunk)
    await catalog.store.putMany('timeline_projection', writes.projections.slice(i, i + chunk));
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
    catalog.store.getAll<TimelineProjection>('timeline_projection'),
    hashTerms.length > 0 ? catalog.store.getAll<AssetBlob>('asset_blob') : Promise.resolve<AssetBlob[]>([]),
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
    catalog.store.getAll<AssetBlob>('asset_blob'),
    query.serverId
      ? catalog.store.getAllFromIndex<BlobLocation>('blob_location', 'by_server_state', [query.serverId, 'present'])
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
        catalog.store.get<Blob>('blob', assetBlob.sha256),
        catalog.store.getAllFromIndex<BlobUrl>('blob_url', 'by_sha256', assetBlob.sha256),
        catalog.store.getAllFromIndex<BlobLocation>('blob_location', 'by_sha256', assetBlob.sha256),
        catalog.store.getAllFromIndex<MetadataFact>('metadata_fact', 'by_subject', assetBlob.sha256),
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
  const assetBlobs = await catalog.store.getAllFromIndex<AssetBlob>('asset_blob', 'by_asset', assetId);
  return assetBlobs.sort((a, b) => a.ordinal - b.ordinal);
}

export async function getCatalogTimelineAsset(
  catalog: Catalog,
  pubkey: string,
  assetId: string
): Promise<TimelineAssetDetail | undefined> {
  const projection = await catalog.store.get<TimelineProjection>('timeline_projection', `${pubkey}:${assetId}`);
  if (!projection) return;
  const [blobs, catalogEvent] = await Promise.all([
    assetBlobsInOrder(catalog, assetId).then(assetBlobs => loadAssetBlobs(catalog, assetBlobs)),
    projection.eventId
      ? catalog.store.get<CatalogEvent>('catalog_event', projection.eventId)
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
    catalog.store.getAll<Asset>('asset'),
    catalog.store.getAll<AssetBlob>('asset_blob'),
    catalog.store.getAll<{ fromSha256: string; state: 'active' | 'unresolved' | 'failed' | 'truncated' }>(
      'blob_relationship'
    ),
    catalog.store.getAll<BlobLocation>('blob_location'),
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
    catalog.store.getAll<AssetBlob>('asset_blob'),
    catalog.store.getAll<BlobLocation>('blob_location'),
    catalog.store.getAll<Server>('server'),
    catalog.store.getAll<ProfileServer>('profile_server'),
    catalog.store.getAll<Blob>('blob'),
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
