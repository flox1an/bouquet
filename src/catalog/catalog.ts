import type { BlobDescriptor } from 'blossom-client-sdk';
import type { NostrEvent } from 'nostr-tools';
import { extractHashFromUrl } from '../utils/blossom';
import { isHlsPlaylistBody, parseHlsPlaylist } from '../utils/blobRelationshipGraph';
import { extractEventReferences, EVENT_EXTRACTOR_VERSION, type EventReference } from './eventReferences';

const DATABASE_NAME = 'bouquet-user-blob-catalog';
const DATABASE_VERSION = 5;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

export type CatalogServerType = 'blossom' | 'nip96';
export type EvidenceType = 'server-list' | 'authored-event' | 'event-reference' | 'reverse-event' | 'upload' | 'mirror' | 'manual' | 'manifest-child';
export type ServerListState = 'pending' | 'complete' | 'failed' | 'unsupported';

type ProfileRecord = { pubkey: string; createdAt: number; lastSyncAt?: number; catalogVersion: number };
type ServerRecord = { serverId: string; baseUrl: string; serverType: CatalogServerType; capabilities: string[]; lastCapabilityCheckAt?: number };
type ProfileServerRecord = { id: string; pubkey: string; serverId: string; source: 'configuration'; enabled: boolean; firstSeenAt: number; lastSeenAt: number };
type BlobRecord = { sha256: string; verifiedSize?: number; verifiedMimeType?: string; firstSeenAt: number; lastEnrichedAt?: number };
type MembershipRecord = { id: string; pubkey: string; sha256: string; firstSeenAt: number; lastSeenAt: number; status: 'active' | 'unresolved' | 'forgotten' };
type EvidenceRecord = { evidenceId: string; pubkey: string; sha256: string; evidenceType: EvidenceType; sourceId: string; relationRole: string; discoveredAt: number; depth: number; parentSha256?: string };
type ServerListRunRecord = { id: string; pubkey: string; serverId: string; cursor?: string; state: ServerListState; startedAt: number; completedAt?: number; error?: string; received: number };
type CatalogEventRecord = { eventId: string; event: NostrEvent; pubkey: string; kind: number; createdAt: number; firstSeenAt: number; lastSeenAt: number; extractorVersion: number; extractedAt?: number };
type ProfileEventRecord = { id: string; pubkey: string; eventId: string; firstSeenAt: number; lastSeenAt: number; source: 'authored' | 'reverse'; rootSha256?: string };
type EventRelayRecord = { id: string; pubkey: string; eventId: string; relayUrl: string; firstSeenAt: number; lastSeenAt: number };
type EventReferenceRecord = { id: string; pubkey: string; eventId: string; sha256?: string; url?: string; role: string; isDirect: boolean; extractedAt: number; extractorVersion: number };
type EventSyncRunRecord = { id: string; pubkey: string; relayUrl: string; cursor?: number; state: 'pending' | 'complete' | 'failed'; startedAt: number; completedAt?: number; error?: string; received: number };
type ReverseLookupJobRecord = { id: string; pubkey: string; sha256: string; relayUrl: string; state: 'pending' | 'complete' | 'failed'; startedAt: number; completedAt?: number; error?: string; received: number };
type BlobUrlRecord = { id: string; sha256?: string; url: string; role: string; sourceType: 'server' | 'event' | 'manifest'; sourceId: string; firstSeenAt: number; lastSeenAt: number };
type BlobRelationshipRecord = { id: string; fromSha256: string; toSha256?: string; toUrl?: string; type: 'playlist' | 'segment' | 'init-segment'; sourceId: string; firstSeenAt: number; lastVerifiedAt: number; state: 'active' | 'unresolved' | 'failed' | 'truncated' };
type MetadataFactRecord = { id: string; subjectId: string; namespace: string; field: string; value: string | number; valueType: 'string' | 'number'; sourceType: 'content' | 'event' | 'heuristic'; sourceId: string; observedAt: number; extractorVersion: number };
type ExtractorResultRecord = { id: string; sha256: string; name: string; version: number; state: 'pending' | 'complete' | 'failed' | 'unsupported' | 'truncated'; payload?: string; completedAt?: number; error?: string };

type StoreName =
  | 'profile'
  | 'server'
  | 'profile_server'
  | 'blob'
  | 'profile_blob_membership'
  | 'profile_blob_evidence'
  | 'server_list_run'
  | 'catalog_event'
  | 'profile_event'
  | 'event_relay_observation'
  | 'event_reference'
  | 'event_sync_run'
  | 'reverse_lookup_job'
  | 'blob_url'
  | 'blob_relationship'
  | 'metadata_fact'
  | 'extractor_result';

export interface CatalogStore {
  get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined>;
  put<T>(store: StoreName, value: T): Promise<void>;
  getAll<T>(store: StoreName): Promise<T[]>;
}

function request<T>(operation: IDBRequest<T>): Promise<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  operation.onsuccess = () => resolve(operation.result);
  operation.onerror = () => reject(operation.error ?? new Error('IndexedDB request failed'));
  return promise;
}

export class IndexedDbCatalogStore implements CatalogStore {
  private readonly database: Promise<IDBDatabase>;

  constructor(name = DATABASE_NAME) {
    const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
    const open = indexedDB.open(name, DATABASE_VERSION);
    open.onerror = () => reject(open.error ?? new Error('Unable to open catalog database'));
    open.onupgradeneeded = event => this.migrate(open.result, open.transaction!, (event as IDBVersionChangeEvent).oldVersion);
    open.onsuccess = () => resolve(open.result);
    this.database = promise;
  }

  async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    const db = await this.database;
    const transaction = db.transaction(store, 'readonly');
    return (await request(transaction.objectStore(store).get(key))) as T | undefined;
  }

  async put<T>(store: StoreName, value: T): Promise<void> {
    const db = await this.database;
    const transaction = db.transaction(store, 'readwrite');
    await request(transaction.objectStore(store).put(value));
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    await promise;
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    const db = await this.database;
    const transaction = db.transaction(store, 'readonly');
    return (await request(transaction.objectStore(store).getAll())) as T[];
  }
  private migrate(db: IDBDatabase, transaction: IDBTransaction, oldVersion: number) {
    if (oldVersion < 1) {
      db.createObjectStore('profile', { keyPath: 'pubkey' });
      db.createObjectStore('server', { keyPath: 'serverId' });
      db.createObjectStore('profile_server', { keyPath: 'id' });
      db.createObjectStore('blob', { keyPath: 'sha256' });
      db.createObjectStore('profile_blob_membership', { keyPath: 'id' });
      db.createObjectStore('profile_blob_evidence', { keyPath: 'evidenceId' });
      db.createObjectStore('server_list_run', { keyPath: 'id' });
    }
    if (oldVersion < 2) {
      db.createObjectStore('catalog_event', { keyPath: 'eventId' });
      db.createObjectStore('profile_event', { keyPath: 'id' });
      db.createObjectStore('event_relay_observation', { keyPath: 'id' });
      db.createObjectStore('event_reference', { keyPath: 'id' });
      db.createObjectStore('event_sync_run', { keyPath: 'id' });
    }
    if (oldVersion < 3) {
      transaction.objectStore('profile_server').createIndex('by_pubkey', 'pubkey');
      transaction.objectStore('profile_blob_membership').createIndex('by_pubkey', 'pubkey');
      transaction.objectStore('profile_blob_evidence').createIndex('by_profile_hash', ['pubkey', 'sha256']);
      transaction.objectStore('profile_blob_evidence').createIndex('by_source', ['evidenceType', 'sourceId']);
      transaction.objectStore('server_list_run').createIndex('by_pubkey', 'pubkey');
      transaction.objectStore('catalog_event').createIndex('by_pubkey_kind_created_at', ['pubkey', 'kind', 'createdAt']);
      transaction.objectStore('profile_event').createIndex('by_pubkey', 'pubkey');
      transaction.objectStore('event_relay_observation').createIndex('by_profile_event', ['pubkey', 'eventId']);
      transaction.objectStore('event_reference').createIndex('by_profile_event', ['pubkey', 'eventId']);
      transaction.objectStore('event_sync_run').createIndex('by_pubkey', 'pubkey');
    }
    if (oldVersion < 4) {
      db.createObjectStore('reverse_lookup_job', { keyPath: 'id' });
      transaction.objectStore('reverse_lookup_job').createIndex('by_profile_relay', ['pubkey', 'relayUrl']);
    }
    if (oldVersion < 5) {
      db.createObjectStore('blob_url', { keyPath: 'id' });
      db.createObjectStore('blob_relationship', { keyPath: 'id' });
      db.createObjectStore('metadata_fact', { keyPath: 'id' });
      db.createObjectStore('extractor_result', { keyPath: 'id' });
      transaction.objectStore('blob_url').createIndex('by_sha256', 'sha256');
      transaction.objectStore('blob_relationship').createIndex('by_from_sha256', 'fromSha256');
      transaction.objectStore('metadata_fact').createIndex('by_subject', 'subjectId');
      transaction.objectStore('extractor_result').createIndex('by_sha256', 'sha256');
    }
  }
}

export class MemoryCatalogStore implements CatalogStore {
  private readonly stores = new Map<StoreName, Map<IDBValidKey, unknown>>();

  async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    return this.getStore(store).get(key) as T | undefined;
  }

  async put<T>(store: StoreName, value: T): Promise<void> {
    this.getStore(store).set(recordKeyForStore(store, value), structuredClone(value));
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    return [...this.getStore(store).values()].map(value => structuredClone(value) as T);
  }

  private getStore(name: StoreName) {
    let store = this.stores.get(name);
    if (!store) {
      store = new Map();
      this.stores.set(name, store);
    }
    return store;
  }
}

const KEY_FIELD_BY_STORE: Record<StoreName, string> = {
  profile: 'pubkey',
  server: 'serverId',
  profile_server: 'id',
  blob: 'sha256',
  profile_blob_membership: 'id',
  profile_blob_evidence: 'evidenceId',
  server_list_run: 'id',
  catalog_event: 'eventId',
  profile_event: 'id',
  event_relay_observation: 'id',
  event_reference: 'id',
  event_sync_run: 'id',
  reverse_lookup_job: 'id',
  blob_url: 'id',
  blob_relationship: 'id',
  metadata_fact: 'id',
  extractor_result: 'id',
};

function recordKeyForStore(store: StoreName, value: unknown): IDBValidKey {
  if (!value || typeof value !== 'object') throw new Error('Catalog records must be objects');
  const key = (value as Record<string, unknown>)[KEY_FIELD_BY_STORE[store]];
  if (typeof key !== 'string') throw new Error(`Catalog record is missing ${KEY_FIELD_BY_STORE[store]}`);
  return key;
}

export type CatalogStatus = {
  knownHashes: number;
  directSeeds: number;
  derivedSeeds: number;
  serverLists: Array<{ serverId: string; state: ServerListState; cursor?: string; error?: string; received: number }>;
  relaySyncs: Array<{ relayUrl: string; state: 'pending' | 'complete' | 'failed'; cursor?: number; error?: string; received: number }>;
  reverseLookups: { pending: number; failed: number };
  enrichments: { pending: number; failed: number; truncated: number };
  lastSyncAt?: number;
};

export type ServerListInput = {
  server: { url: string; type: CatalogServerType };
  blobs?: BlobDescriptor[];
  cursor?: string;
  state: ServerListState;
  error?: string;
};

export type EventPageLoader = (input: { until?: number; limit: number }) => Promise<NostrEvent[]>;

export type ReverseLookupBatchLoader = (hashes: string[]) => Promise<NostrEvent[]>;
export type HlsPlaylistLoader = (url: string) => Promise<string>;
export type HlsExpansionLimits = { maxDepth: number; maxDescendants: number };
export type BlobPrefixLoader = (url: string, maxBytes: number) => Promise<{ bytes: ArrayBuffer; mimeType?: string; size?: number; truncated: boolean }>;

export class Catalog {
  constructor(private readonly store: CatalogStore) {}

  async ingestServerList(pubkey: string, input: ServerListInput): Promise<void> {
    const now = Date.now();
    const serverId = normalizeServerUrl(input.server.url);
    await this.ensureProfile(pubkey, now);
    await this.upsertServer(pubkey, serverId, input.server.type, now);

    const runId = `${pubkey}:${serverId}:list`;
    const previousRun = await this.store.get<ServerListRunRecord>('server_list_run', runId);
    await this.store.put<ServerListRunRecord>('server_list_run', {
      id: runId,
      pubkey,
      serverId,
      cursor: input.cursor,
      state: input.state,
      startedAt: previousRun?.startedAt ?? now,
      completedAt: input.state === 'complete' || input.state === 'unsupported' ? now : undefined,
      error: input.error,
      received: input.blobs?.length ?? previousRun?.received ?? 0,
    });

    for (const descriptor of input.blobs ?? []) {
      await this.ingestBlob(pubkey, descriptor, {
        evidenceType: 'server-list',
        sourceId: serverId,
        relationRole: 'main',
        depth: 0,
        discoveredAt: now,
      });
    }
    this.changed();
  }

  async ingestUpload(pubkey: string, server: { url: string; type: CatalogServerType }, descriptor: BlobDescriptor, mirrored = false): Promise<void> {
    const now = Date.now();
    const serverId = normalizeServerUrl(server.url);
    await this.ensureProfile(pubkey, now);
    await this.upsertServer(pubkey, serverId, server.type, now);
    await this.ingestBlob(pubkey, descriptor, {
      evidenceType: mirrored ? 'mirror' : 'upload',
      sourceId: `${serverId}:${descriptor.url}`,
      relationRole: 'main',
      depth: 0,
      discoveredAt: now,
    });
    this.changed();
  }

  async ingestAuthoredEvents(pubkey: string, events: NostrEvent[], relayUrl: string): Promise<void> {
    const now = Date.now();
    await this.ensureProfile(pubkey, now);
    for (const event of events) await this.persistEvent(pubkey, event, relayUrl, now);
    this.changed();
  }

  async syncAuthoredEvents(pubkey: string, relayUrl: string, loadPage: EventPageLoader, limit = 500): Promise<void> {
    const id = `${pubkey}:${relayUrl}:authored-events`;
    const previous = await this.store.get<EventSyncRunRecord>('event_sync_run', id);
    let until = previous?.state === 'pending' ? previous.cursor : undefined;
    let received = previous?.state === 'pending' ? previous.received : 0;
    const startedAt = previous?.state === 'pending' ? previous.startedAt : Date.now();

    await this.store.put<EventSyncRunRecord>('event_sync_run', { id, pubkey, relayUrl, cursor: until, state: 'pending', startedAt, received });
    try {
      while (true) {
        const page = await loadPage({ until, limit });
        const authored = page.filter(event => event.pubkey === pubkey);
        await this.ingestAuthoredEvents(pubkey, authored, relayUrl);
        received += authored.length;
        const oldest = page.reduce<number | undefined>((value, event) => value === undefined ? event.created_at : Math.min(value, event.created_at), undefined);
        if (page.length < limit || oldest === undefined) break;
        until = oldest - 1;
        await this.store.put<EventSyncRunRecord>('event_sync_run', { id, pubkey, relayUrl, cursor: until, state: 'pending', startedAt, received });
      }
      await this.store.put<EventSyncRunRecord>('event_sync_run', { id, pubkey, relayUrl, state: 'complete', startedAt, completedAt: Date.now(), received });
      await this.touchProfileSync(pubkey);
      this.changed();
    } catch (error) {
      await this.store.put<EventSyncRunRecord>('event_sync_run', {
        id,
        pubkey,
        relayUrl,
        cursor: until,
        state: 'failed',
        startedAt,
        error: error instanceof Error ? error.message : String(error),
        received,
      });
      this.changed();
      throw error;
    }
  }

  async reprojectEvents(pubkey: string): Promise<void> {
    const profileEvents = (await this.store.getAll<ProfileEventRecord>('profile_event')).filter(event => event.pubkey === pubkey);
    const now = Date.now();
    for (const profileEvent of profileEvents) {
      const record = await this.store.get<CatalogEventRecord>('catalog_event', profileEvent.eventId);
      if (record) await this.persistEvent(pubkey, record.event, undefined, now, profileEvent.source, profileEvent.rootSha256);
    }
    this.changed();
  }

  async syncReverseLookups(pubkey: string, relayUrl: string, loadBatch: ReverseLookupBatchLoader, batchSize = 50, maxHashes = 200): Promise<void> {
    const memberships = (await this.store.getAll<MembershipRecord>('profile_blob_membership'))
      .filter(membership => membership.pubkey === pubkey && membership.status === 'active');
    const completed = new Set(
      (await this.store.getAll<ReverseLookupJobRecord>('reverse_lookup_job'))
        .filter(job => job.pubkey === pubkey && job.relayUrl === relayUrl && job.state === 'complete')
        .map(job => job.sha256)
    );
    const pending = memberships.map(membership => membership.sha256).filter(sha256 => !completed.has(sha256)).slice(0, maxHashes);
    for (let start = 0; start < pending.length; start += batchSize) {
      const hashes = pending.slice(start, start + batchSize);
      const now = Date.now();
      for (const sha256 of hashes) {
        await this.store.put<ReverseLookupJobRecord>('reverse_lookup_job', {
          id: `${pubkey}:${relayUrl}:${sha256}`,
          pubkey,
          sha256,
          relayUrl,
          state: 'pending',
          startedAt: now,
          received: 0,
        });
      }
      try {
        const events = await loadBatch(hashes);
        for (const sha256 of hashes) {
          const matching = events.filter(event => event.tags.some(tag => tag[0] === 'x' && tag[1]?.toLowerCase() === sha256));
          for (const event of matching) await this.persistEvent(pubkey, event, relayUrl, now, 'reverse', sha256);
          await this.store.put<ReverseLookupJobRecord>('reverse_lookup_job', {
            id: `${pubkey}:${relayUrl}:${sha256}`,
            pubkey,
            sha256,
            relayUrl,
            state: 'complete',
            startedAt: now,
            completedAt: Date.now(),
            received: matching.length,
          });
        }
      } catch (error) {
        for (const sha256 of hashes) {
          await this.store.put<ReverseLookupJobRecord>('reverse_lookup_job', {
            id: `${pubkey}:${relayUrl}:${sha256}`,
            pubkey,
            sha256,
            relayUrl,
            state: 'failed',
            startedAt: now,
            error: error instanceof Error ? error.message : String(error),
            received: 0,
          });
        }
        this.changed();
        throw error;
      }
    }
    this.changed();
  }

  async enrichHls(pubkey: string, rootSha256: string, loadPlaylist: HlsPlaylistLoader, limits: HlsExpansionLimits = { maxDepth: 3, maxDescendants: 200 }): Promise<void> {
    const resultId = `${rootSha256}:hls:1`;
    const existing = await this.store.get<ExtractorResultRecord>('extractor_result', resultId);
    if (existing?.state === 'complete') return;
    const urls = (await this.store.getAll<BlobUrlRecord>('blob_url')).filter(item => item.sha256 === rootSha256);
    const rootUrl = urls[0]?.url;
    if (!rootUrl) {
      await this.store.put<ExtractorResultRecord>('extractor_result', { id: resultId, sha256: rootSha256, name: 'hls', version: 1, state: 'failed', completedAt: Date.now(), error: 'No URL is known for this blob' });
      return;
    }
    await this.store.put<ExtractorResultRecord>('extractor_result', { id: resultId, sha256: rootSha256, name: 'hls', version: 1, state: 'pending' });
    const queue: Array<{ url: string; sha256: string; depth: number }> = [{ url: rootUrl, sha256: rootSha256, depth: 0 }];
    const seen = new Set<string>();
    let descendants = 0;
    let truncated = false;
    try {
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (seen.has(current.url)) continue;
        seen.add(current.url);
        const body = await loadPlaylist(current.url);
        if (!isHlsPlaylistBody(body)) continue;
        const parsed = parseHlsPlaylist(current.url, body);
        const duration = parsed.segments.reduce((total, segment) => total + (segment.duration ?? 0), 0);
        if (duration > 0) await this.recordFact(current.sha256, 'playlist', 'duration', duration, 'number', 'content', current.sha256);
        for (const child of [...parsed.playlistUrls.map(url => ({ url, type: 'playlist' as const })), ...parsed.segments.map(segment => ({ url: segment.url, type: segment.isInit ? 'init-segment' as const : 'segment' as const }))]) {
          descendants += 1;
          const childSha256 = extractHashFromUrl(child.url)?.toLowerCase();
          const state = descendants > limits.maxDescendants || (child.type === 'playlist' && current.depth >= limits.maxDepth) ? 'truncated' : childSha256 ? 'active' : 'unresolved';
          await this.recordRelationship(current.sha256, childSha256, child.url, child.type, rootSha256, state);
          await this.recordBlobUrl(childSha256, child.url, child.type, 'manifest', rootSha256);
          if (childSha256) {
            await this.ingestBlob(pubkey, { sha256: childSha256, url: child.url, type: '', size: 0, uploaded: 0 }, {
              evidenceType: 'manifest-child',
              sourceId: rootSha256,
              relationRole: child.type,
              depth: current.depth + 1,
              parentSha256: current.sha256,
              discoveredAt: Date.now(),
            });
          }
          if (state === 'truncated') {
            truncated = true;
            continue;
          }
          if (child.type === 'playlist') queue.push({ url: child.url, sha256: childSha256 ?? current.sha256, depth: current.depth + 1 });
        }
      }
      await this.store.put<ExtractorResultRecord>('extractor_result', {
        id: resultId,
        sha256: rootSha256,
        name: 'hls',
        version: 1,
        state: truncated ? 'truncated' : 'complete',
        payload: JSON.stringify({ descendants }),
        completedAt: Date.now(),
      });
    } catch (error) {
      await this.store.put<ExtractorResultRecord>('extractor_result', {
        id: resultId,
        sha256: rootSha256,
        name: 'hls',
        version: 1,
        state: 'failed',
        completedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      this.changed();
    }
  }

  async enrichBlobPrefix(sha256: string, url: string, loadPrefix: BlobPrefixLoader, maxBytes = 512 * 1024): Promise<void> {
    const resultId = `${sha256}:mime-header:1`;
    const existing = await this.store.get<ExtractorResultRecord>('extractor_result', resultId);
    if (existing?.state === 'complete') return;
    await this.store.put<ExtractorResultRecord>('extractor_result', { id: resultId, sha256, name: 'mime-header', version: 1, state: 'pending' });
    try {
      const loaded = await loadPrefix(url, maxBytes);
      const bytes = new Uint8Array(loaded.bytes);
      const mimeType = loaded.mimeType ?? sniffMimeType(bytes);
      if (mimeType) await this.recordFact(sha256, 'common', 'mime_type', mimeType, 'string', 'content', resultId);
      if (loaded.size !== undefined) await this.recordFact(sha256, 'common', 'size', loaded.size, 'number', 'content', resultId);
      const dimensions = imageDimensions(bytes, mimeType);
      if (dimensions) {
        await this.recordFact(sha256, 'image', 'width', dimensions.width, 'number', 'content', resultId);
        await this.recordFact(sha256, 'image', 'height', dimensions.height, 'number', 'content', resultId);
      }
      await this.store.put<ExtractorResultRecord>('extractor_result', {
        id: resultId,
        sha256,
        name: 'mime-header',
        version: 1,
        state: 'complete',
        payload: JSON.stringify({ mimeType, truncated: loaded.truncated }),
        completedAt: Date.now(),
      });
    } catch (error) {
      await this.store.put<ExtractorResultRecord>('extractor_result', {
        id: resultId,
        sha256,
        name: 'mime-header',
        version: 1,
        state: 'failed',
        completedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      this.changed();
    }
  }

  async ingestId3(sha256: string, tags: { title?: string; artist?: string; album?: string; year?: string }): Promise<void> {
    const resultId = `${sha256}:id3:1`;
    const existing = await this.store.get<ExtractorResultRecord>('extractor_result', resultId);
    if (existing?.state === 'complete') return;
    for (const [field, value] of Object.entries(tags)) {
      if (value) await this.recordFact(sha256, 'audio', field, value, 'string', 'content', resultId);
    }
    await this.store.put<ExtractorResultRecord>('extractor_result', {
      id: resultId,
      sha256,
      name: 'id3',
      version: 1,
      state: 'complete',
      payload: JSON.stringify(tags),
      completedAt: Date.now(),
    });
    this.changed();
  }

  async getCatalogStatus(pubkey: string): Promise<CatalogStatus> {
    const [memberships, evidence, runs, relayRuns, reverseJobs, extractorResults, profile] = await Promise.all([
      this.store.getAll<MembershipRecord>('profile_blob_membership'),
      this.store.getAll<EvidenceRecord>('profile_blob_evidence'),
      this.store.getAll<ServerListRunRecord>('server_list_run'),
      this.store.getAll<EventSyncRunRecord>('event_sync_run'),
      this.store.getAll<ReverseLookupJobRecord>('reverse_lookup_job'),
      this.store.getAll<ExtractorResultRecord>('extractor_result'),
      this.store.get<ProfileRecord>('profile', pubkey),
    ]);
    const profileEvidence = evidence.filter(item => item.pubkey === pubkey);
    const profileHashes = new Set(memberships.filter(item => item.pubkey === pubkey).map(item => item.sha256));
    const profileResults = extractorResults.filter(result => profileHashes.has(result.sha256));
    return {
      knownHashes: memberships.filter(item => item.pubkey === pubkey && item.status === 'active').length,
      directSeeds: profileEvidence.filter(item => item.depth === 0).length,
      derivedSeeds: profileEvidence.filter(item => item.depth > 0).length,
      serverLists: runs.filter(item => item.pubkey === pubkey).map(({ serverId, state, cursor, error, received }) => ({ serverId, state, cursor, error, received })),
      relaySyncs: relayRuns.filter(item => item.pubkey === pubkey).map(({ relayUrl, state, cursor, error, received }) => ({ relayUrl, state, cursor, error, received })),
      reverseLookups: {
        pending: reverseJobs.filter(job => job.pubkey === pubkey && job.state === 'pending').length,
        failed: reverseJobs.filter(job => job.pubkey === pubkey && job.state === 'failed').length,
      },
      enrichments: {
        pending: profileResults.filter(result => result.state === 'pending').length,
        failed: profileResults.filter(result => result.state === 'failed').length,
        truncated: profileResults.filter(result => result.state === 'truncated').length,
      },
      lastSyncAt: profile?.lastSyncAt,
    };
  }

  private async ensureProfile(pubkey: string, now: number) {
    const existing = await this.store.get<ProfileRecord>('profile', pubkey);
    if (!existing) await this.store.put<ProfileRecord>('profile', { pubkey, createdAt: now, catalogVersion: DATABASE_VERSION });
  }

  private async upsertServer(pubkey: string, serverId: string, serverType: CatalogServerType, now: number) {
    const server = await this.store.get<ServerRecord>('server', serverId);
    await this.store.put<ServerRecord>('server', server ?? { serverId, baseUrl: serverId, serverType, capabilities: ['list'], lastCapabilityCheckAt: now });
    const profileServerId = `${pubkey}:${serverId}`;
    const profileServer = await this.store.get<ProfileServerRecord>('profile_server', profileServerId);
    await this.store.put<ProfileServerRecord>('profile_server', {
      id: profileServerId,
      pubkey,
      serverId,
      source: 'configuration',
      enabled: true,
      firstSeenAt: profileServer?.firstSeenAt ?? now,
      lastSeenAt: now,
    });
  }

  private async ingestBlob(pubkey: string, descriptor: BlobDescriptor, evidence: Omit<EvidenceRecord, 'evidenceId' | 'pubkey' | 'sha256'>) {
    const sha256 = descriptor.sha256.toLowerCase();
    if (!HASH_PATTERN.test(sha256)) throw new Error(`Invalid SHA-256 hash: ${descriptor.sha256}`);
    const blob = await this.store.get<BlobRecord>('blob', sha256);
    await this.store.put<BlobRecord>('blob', {
      sha256,
      verifiedSize: blob?.verifiedSize ?? descriptor.size,
      verifiedMimeType: blob?.verifiedMimeType ?? descriptor.type,
      firstSeenAt: blob?.firstSeenAt ?? evidence.discoveredAt,
      lastEnrichedAt: blob?.lastEnrichedAt,
    });
    if (descriptor.url) {
      const sourceType = evidence.evidenceType === 'manifest-child' ? 'manifest' : evidence.evidenceType === 'authored-event' || evidence.evidenceType === 'event-reference' || evidence.evidenceType === 'reverse-event' ? 'event' : 'server';
      await this.recordBlobUrl(sha256, descriptor.url, evidence.relationRole, sourceType, evidence.sourceId);
    }
    const membershipId = `${pubkey}:${sha256}`;
    const membership = await this.store.get<MembershipRecord>('profile_blob_membership', membershipId);
    await this.store.put<MembershipRecord>('profile_blob_membership', {
      id: membershipId,
      pubkey,
      sha256,
      firstSeenAt: membership?.firstSeenAt ?? evidence.discoveredAt,
      lastSeenAt: evidence.discoveredAt,
      status: 'active',
    });
    const evidenceId = `${pubkey}:${sha256}:${evidence.evidenceType}:${evidence.sourceId}:${evidence.relationRole}`;
    const previousEvidence = await this.store.get<EvidenceRecord>('profile_blob_evidence', evidenceId);
    await this.store.put<EvidenceRecord>('profile_blob_evidence', {
      evidenceId,
      pubkey,
      sha256,
      ...evidence,
      discoveredAt: previousEvidence?.discoveredAt ?? evidence.discoveredAt,
    });
  }

  private async recordBlobUrl(sha256: string | undefined, url: string, role: string, sourceType: BlobUrlRecord['sourceType'], sourceId: string) {
    if (!url) return;
    const now = Date.now();
    const id = `${sourceType}:${sourceId}:${role}:${url}`;
    const existing = await this.store.get<BlobUrlRecord>('blob_url', id);
    await this.store.put<BlobUrlRecord>('blob_url', {
      id,
      sha256,
      url,
      role,
      sourceType,
      sourceId,
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
    });
  }

  private async recordRelationship(fromSha256: string, toSha256: string | undefined, toUrl: string, type: BlobRelationshipRecord['type'], sourceId: string, state: BlobRelationshipRecord['state']) {
    const id = `${fromSha256}:${type}:${toUrl}`;
    const existing = await this.store.get<BlobRelationshipRecord>('blob_relationship', id);
    await this.store.put<BlobRelationshipRecord>('blob_relationship', {
      id,
      fromSha256,
      toSha256,
      toUrl,
      type,
      sourceId,
      firstSeenAt: existing?.firstSeenAt ?? Date.now(),
      lastVerifiedAt: Date.now(),
      state,
    });
  }

  private async recordFact(subjectId: string, namespace: string, field: string, value: string | number, valueType: MetadataFactRecord['valueType'], sourceType: MetadataFactRecord['sourceType'], sourceId: string) {
    const id = `${subjectId}:${namespace}:${field}:${sourceType}:${sourceId}:1`;
    await this.store.put<MetadataFactRecord>('metadata_fact', {
      id,
      subjectId,
      namespace,
      field,
      value,
      valueType,
      sourceType,
      sourceId,
      observedAt: Date.now(),
      extractorVersion: 1,
    });
  }

  private async persistEvent(pubkey: string, event: NostrEvent, relayUrl: string | undefined, now: number, source: 'authored' | 'reverse' = 'authored', rootSha256?: string) {
    const existing = await this.store.get<CatalogEventRecord>('catalog_event', event.id);
    await this.store.put<CatalogEventRecord>('catalog_event', {
      eventId: event.id,
      event,
      pubkey: event.pubkey,
      kind: event.kind,
      createdAt: event.created_at,
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
      extractorVersion: EVENT_EXTRACTOR_VERSION,
      extractedAt: now,
    });
    const profileEventId = `${pubkey}:${event.id}`;
    const profileEvent = await this.store.get<ProfileEventRecord>('profile_event', profileEventId);
    await this.store.put<ProfileEventRecord>('profile_event', {
      id: profileEventId,
      pubkey,
      eventId: event.id,
      firstSeenAt: profileEvent?.firstSeenAt ?? now,
      lastSeenAt: now,
      source,
      rootSha256,
    });
    if (relayUrl) {
      const relayId = `${pubkey}:${event.id}:${relayUrl}`;
      const relay = await this.store.get<EventRelayRecord>('event_relay_observation', relayId);
      await this.store.put<EventRelayRecord>('event_relay_observation', { id: relayId, pubkey, eventId: event.id, relayUrl, firstSeenAt: relay?.firstSeenAt ?? now, lastSeenAt: now });
    }
    const references = extractEventReferences(event);
    for (const [index, reference] of references.entries()) {
      await this.persistEventReference(pubkey, event.id, reference, index, now);
      if (reference.url) await this.recordBlobUrl(reference.sha256, reference.url, reference.role, 'event', event.id);
      if (source === 'authored' && reference.sha256) {
        await this.ingestBlob(pubkey, descriptorFromReference(reference), {
          evidenceType: reference.isDirect ? 'authored-event' : 'event-reference',
          sourceId: event.id,
          relationRole: reference.role,
          depth: reference.isDirect ? 0 : 1,
          discoveredAt: now,
        });
      }
      const isReverseCompanion = reference.role === 'image' || reference.role === 'thumbnail' || reference.role === 'fallback' || reference.role === 'mirror' || reference.role === 'text-track';
      if (source === 'reverse' && rootSha256 && reference.sha256 && reference.sha256 !== rootSha256 && isReverseCompanion) {
        await this.ingestBlob(pubkey, descriptorFromReference(reference), {
          evidenceType: 'reverse-event',
          sourceId: `${rootSha256}:${event.id}`,
          relationRole: reference.role,
          depth: 1,
          parentSha256: rootSha256,
          discoveredAt: now,
        });
      }
    }
  }

  private async persistEventReference(pubkey: string, eventId: string, reference: EventReference, index: number, now: number) {
    const id = `${pubkey}:${eventId}:${reference.role}:${index}`;
    await this.store.put<EventReferenceRecord>('event_reference', {
      id,
      pubkey,
      eventId,
      sha256: reference.sha256,
      url: reference.url,
      role: reference.role,
      isDirect: reference.isDirect,
      extractedAt: now,
      extractorVersion: EVENT_EXTRACTOR_VERSION,
    });
  }

  private async touchProfileSync(pubkey: string) {
    const profile = await this.store.get<ProfileRecord>('profile', pubkey);
    if (profile) await this.store.put<ProfileRecord>('profile', { ...profile, lastSyncAt: Date.now() });
  }

  private changed() {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('bouquet-catalog-changed'));
  }
}

function descriptorFromReference(reference: EventReference): BlobDescriptor {
  return { sha256: reference.sha256!, url: reference.url ?? '', type: '', size: 0, uploaded: 0 };
}

function sniffMimeType(bytes: Uint8Array): string | undefined {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && String.fromCharCode(...bytes.slice(0, 6)) === 'GIF87a') return 'image/gif';
  if (bytes.length >= 6 && String.fromCharCode(...bytes.slice(0, 6)) === 'GIF89a') return 'image/gif';
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-') return 'application/pdf';
  if (bytes.length >= 3 && String.fromCharCode(...bytes.slice(0, 3)) === 'ID3') return 'audio/mpeg';
  return undefined;
}

function imageDimensions(bytes: Uint8Array, mimeType: string | undefined): { width: number; height: number } | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mimeType === 'image/png' && bytes.length >= 24) return { width: view.getUint32(16), height: view.getUint32(20) };
  if (mimeType === 'image/gif' && bytes.length >= 10) return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  if (mimeType !== 'image/jpeg') return undefined;
  for (let offset = 2; offset + 9 < bytes.length;) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const length = view.getUint16(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
    if (length < 2) return undefined;
    offset += length + 2;
  }
  return undefined;
}

export function normalizeServerUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/$/, '');
}

let catalog: Catalog | undefined;
export function getCatalog(): Catalog {
  if (!catalog) catalog = new Catalog(new IndexedDbCatalogStore());
  return catalog;
}
