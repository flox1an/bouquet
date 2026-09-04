import type { BlobDescriptor } from 'blossom-client-sdk';
import type { NostrEvent } from 'nostr-tools';
import { extractHashFromUrl } from '../utils/blossom';
import { isHlsPlaylistBody, parseHlsPlaylist } from '../utils/hlsPlaylist';
import { GENERIC_MIME_TYPES, isGenericMimeType, PLAYLIST_MIME_TYPES } from '../utils/mimeTypes';
import { extractEventReferences, EVENT_EXTRACTOR_VERSION, type EventReference } from './eventReferences';
import { extractTimelineEventMetadata, type TimelineEventMetadata } from './timelineMetadata';

const DATABASE_NAME = 'bouquet-user-blob-catalog';
const DATABASE_VERSION = 10;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

/**
 * Bumped when `timeline_projection` records change shape. A profile stamped with an
 * older version is reprojected once, so the query never has to cope with two shapes.
 */
export const PROJECTION_VERSION = 1;

/** Bumped when the byte sniffer learns a format it used to shrug at: version 2 knows
    fMP4 media segments (`styp`/`moof`), which is most of an HLS video. */
const MIME_EXTRACTOR_VERSION = 2;

/** Bumped when the playlist reader changes in a way that makes an earlier expansion
    wrong: version 2 reads playlists whose host omits `content-range` in full. */
const HLS_EXTRACTOR_VERSION = 2;

export type CatalogServerType = 'blossom' | 'nip96';
export type EvidenceType =
  | 'server-list'
  | 'authored-event'
  | 'event-reference'
  | 'additional-event'
  | 'reverse-event'
  | 'upload'
  | 'mirror'
  | 'manual'
  | 'manifest-child';
export type ServerListState = 'pending' | 'complete' | 'failed' | 'unsupported';

type ProfileRecord = {
  pubkey: string;
  createdAt: number;
  lastSyncAt?: number;
  lastMutationAt?: number;
  lastProjectedAt?: number;
  projectionVersion?: number;
  catalogVersion: number;
  eventExtractorVersion?: number;
};
export type AdditionalPubkey = {
  pubkey: string;
  relayHints: string[];
  addedAt: number;
};
type AdditionalPubkeyRecord = AdditionalPubkey & {
  id: string;
  ownerPubkey: string;
};
type ServerRecord = {
  serverId: string;
  baseUrl: string;
  serverType: CatalogServerType;
  capabilities: string[];
  lastCapabilityCheckAt?: number;
};
type ProfileServerRecord = {
  id: string;
  pubkey: string;
  serverId: string;
  source: 'configuration';
  enabled: boolean;
  firstSeenAt: number;
  lastSeenAt: number;
};
type BlobRecord = {
  sha256: string;
  verifiedSize?: number;
  verifiedMimeType?: string;
  uploadedAt?: number;
  firstSeenAt: number;
  lastEnrichedAt?: number;
};
type MembershipRecord = {
  id: string;
  pubkey: string;
  sha256: string;
  firstSeenAt: number;
  lastSeenAt: number;
  status: 'active' | 'unresolved' | 'forgotten';
};
type EvidenceRecord = {
  evidenceId: string;
  pubkey: string;
  sha256: string;
  evidenceType: EvidenceType;
  sourceId: string;
  relationRole: string;
  discoveredAt: number;
  depth: number;
  parentSha256?: string;
};
type ServerListRunRecord = {
  id: string;
  pubkey: string;
  serverId: string;
  cursor?: string;
  state: ServerListState;
  startedAt: number;
  completedAt?: number;
  error?: string;
  received: number;
};
type CatalogEventRecord = {
  eventId: string;
  event: NostrEvent;
  pubkey: string;
  kind: number;
  createdAt: number;
  firstSeenAt: number;
  lastSeenAt: number;
  extractorVersion: number;
  extractedAt?: number;
};
type ProfileEventRecord = {
  id: string;
  pubkey: string;
  eventId: string;
  firstSeenAt: number;
  lastSeenAt: number;
  source: 'authored' | 'additional' | 'reverse';
  rootSha256?: string;
};
type EventRelayRecord = {
  id: string;
  pubkey: string;
  eventId: string;
  relayUrl: string;
  firstSeenAt: number;
  lastSeenAt: number;
};
type EventReferenceRecord = {
  id: string;
  pubkey: string;
  eventId: string;
  sha256?: string;
  url?: string;
  role: string;
  isDirect: boolean;
  extractedAt: number;
  extractorVersion: number;
};
type EventSyncRunRecord = {
  id: string;
  pubkey: string;
  relayUrl: string;
  cursor?: number;
  sourcePubkey?: string;
  state: 'pending' | 'complete' | 'failed';
  startedAt: number;
  completedAt?: number;
  error?: string;
  received: number;
};
type ReverseLookupJobRecord = {
  id: string;
  pubkey: string;
  sha256: string;
  relayUrl: string;
  state: 'pending' | 'complete' | 'failed';
  startedAt: number;
  completedAt?: number;
  error?: string;
  received: number;
};
type BlobUrlRecord = {
  id: string;
  sha256?: string;
  url: string;
  role: string;
  sourceType: 'server' | 'event' | 'manifest';
  sourceId: string;
  firstSeenAt: number;
  lastSeenAt: number;
};
type BlobRelationshipRecord = {
  id: string;
  fromSha256: string;
  toSha256?: string;
  toUrl?: string;
  type: 'playlist' | 'segment' | 'init-segment';
  sourceId: string;
  firstSeenAt: number;
  lastVerifiedAt: number;
  state: 'active' | 'unresolved' | 'failed' | 'truncated';
};
type MetadataFactRecord = {
  id: string;
  subjectId: string;
  namespace: string;
  field: string;
  value: string | number;
  valueType: 'string' | 'number';
  sourceType: 'content' | 'event' | 'heuristic';
  sourceId: string;
  observedAt: number;
  extractorVersion: number;
};
type ExtractorResultRecord = {
  id: string;
  sha256: string;
  name: string;
  version: number;
  state: 'pending' | 'complete' | 'failed' | 'unsupported' | 'truncated';
  payload?: string;
  completedAt?: number;
  error?: string;
};
type TimelineEventRecord = TimelineEventMetadata & { id: string; pubkey: string };

export type StoreName =
  | 'profile'
  | 'additional_pubkey'
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
  | 'extractor_result'
  | 'blob_location'
  | 'blob_location_history'
  | 'asset'
  | 'asset_blob'
  | 'timeline_projection'
  | 'timeline_event';

/**
 * Every index is declared here rather than inside `migrate`, so that the IndexedDB
 * schema and the in-memory store used by the tests cannot drift apart. `since` is the
 * database version that introduced the index, and drives the migration gate.
 */
export type CatalogIndexDefinition = { store: StoreName; name: string; keyPath: string | string[]; since: number };

export const CATALOG_INDEXES: readonly CatalogIndexDefinition[] = [
  { store: 'additional_pubkey', name: 'by_owner', keyPath: 'ownerPubkey', since: 10 },
  { store: 'profile_server', name: 'by_pubkey', keyPath: 'pubkey', since: 3 },
  { store: 'profile_blob_membership', name: 'by_pubkey', keyPath: 'pubkey', since: 3 },
  { store: 'profile_blob_evidence', name: 'by_profile_hash', keyPath: ['pubkey', 'sha256'], since: 3 },
  { store: 'profile_blob_evidence', name: 'by_source', keyPath: ['evidenceType', 'sourceId'], since: 3 },
  { store: 'server_list_run', name: 'by_pubkey', keyPath: 'pubkey', since: 3 },
  { store: 'catalog_event', name: 'by_pubkey_kind_created_at', keyPath: ['pubkey', 'kind', 'createdAt'], since: 3 },
  { store: 'profile_event', name: 'by_pubkey', keyPath: 'pubkey', since: 3 },
  { store: 'event_relay_observation', name: 'by_profile_event', keyPath: ['pubkey', 'eventId'], since: 3 },
  { store: 'event_reference', name: 'by_profile_event', keyPath: ['pubkey', 'eventId'], since: 3 },
  { store: 'event_sync_run', name: 'by_pubkey', keyPath: 'pubkey', since: 3 },
  { store: 'reverse_lookup_job', name: 'by_profile_relay', keyPath: ['pubkey', 'relayUrl'], since: 4 },
  { store: 'blob_url', name: 'by_sha256', keyPath: 'sha256', since: 5 },
  { store: 'blob_relationship', name: 'by_from_sha256', keyPath: 'fromSha256', since: 5 },
  { store: 'metadata_fact', name: 'by_subject', keyPath: 'subjectId', since: 5 },
  { store: 'extractor_result', name: 'by_sha256', keyPath: 'sha256', since: 5 },
  { store: 'blob_location', name: 'by_blob_server', keyPath: ['sha256', 'serverId'], since: 6 },
  { store: 'blob_location', name: 'by_server_state', keyPath: ['serverId', 'state'], since: 6 },
  { store: 'blob_location_history', name: 'by_blob_server', keyPath: ['sha256', 'serverId'], since: 6 },
  { store: 'asset', name: 'by_profile', keyPath: 'pubkey', since: 7 },
  { store: 'asset_blob', name: 'by_asset', keyPath: 'assetId', since: 7 },
  { store: 'timeline_projection', name: 'by_profile_date', keyPath: ['pubkey', 'displayDate'], since: 7 },
  { store: 'timeline_event', name: 'by_profile', keyPath: 'pubkey', since: 8 },
  // Reading every location for one blob is the hot path behind an item's contents.
  // `by_blob_server` could serve it only through a prefix range, which both stores
  // would have to implement identically, so a plain equality index is cheaper to trust.
  { store: 'blob_location', name: 'by_sha256', keyPath: 'sha256', since: 9 },
];

function indexDefinition(store: StoreName, name: string): CatalogIndexDefinition {
  const definition = CATALOG_INDEXES.find(index => index.store === store && index.name === name);
  if (!definition) throw new Error(`Unknown catalog index ${store}.${name}`);
  return definition;
}

export interface CatalogStore {
  get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined>;
  put<T>(store: StoreName, value: T): Promise<void>;
  /** Writes many records of one store in a single transaction; projections and
      ingests use this to avoid one transaction per record. */
  putMany<T>(store: StoreName, values: T[]): Promise<void>;
  getAll<T>(store: StoreName): Promise<T[]>;
  /** Records whose index key equals `key`. Compound indexes take an array key. */
  getAllFromIndex<T>(store: StoreName, index: string, key: IDBValidKey): Promise<T[]>;
  /** Removes one record by primary key. */
  delete(store: StoreName, key: IDBValidKey): Promise<void>;
  /** Removes every record from every store. */
  reset(): Promise<void>;
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
    open.onupgradeneeded = event =>
      this.migrate(open.result, open.transaction!, (event as IDBVersionChangeEvent).oldVersion);
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
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const transaction = db.transaction(store, 'readwrite');
    // Handlers must be registered in the same task as the request: awaiting the
    // request first can let the transaction auto-commit before `oncomplete` is
    // attached, which left writes hanging forever under sync load.
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    transaction.objectStore(store).put(value);
    return promise;
  }

  async putMany<T>(store: StoreName, values: T[]): Promise<void> {
    const db = await this.database;
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const transaction = db.transaction(store, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    const objectStore = transaction.objectStore(store);
    for (const value of values) objectStore.put(value);
    return promise;
  }
  async getAll<T>(store: StoreName): Promise<T[]> {
    const db = await this.database;
    const transaction = db.transaction(store, 'readonly');
    return (await request(transaction.objectStore(store).getAll())) as T[];
  }

  async getAllFromIndex<T>(store: StoreName, index: string, key: IDBValidKey): Promise<T[]> {
    indexDefinition(store, index);
    const db = await this.database;
    const transaction = db.transaction(store, 'readonly');
    return (await request(transaction.objectStore(store).index(index).getAll(key))) as T[];
  }
  async delete(store: StoreName, key: IDBValidKey): Promise<void> {
    const db = await this.database;
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const transaction = db.transaction(store, 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    transaction.objectStore(store).delete(key);
    return promise;
  }
  async reset(): Promise<void> {
    const db = await this.database;
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    const transaction = db.transaction(Array.from(db.objectStoreNames), 'readwrite');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    for (const name of transaction.objectStoreNames) transaction.objectStore(name).clear();
    return promise;
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
    if (oldVersion < 4) db.createObjectStore('reverse_lookup_job', { keyPath: 'id' });
    if (oldVersion < 5) {
      db.createObjectStore('blob_url', { keyPath: 'id' });
      db.createObjectStore('blob_relationship', { keyPath: 'id' });
      db.createObjectStore('metadata_fact', { keyPath: 'id' });
      db.createObjectStore('extractor_result', { keyPath: 'id' });
    }
    if (oldVersion < 6) {
      db.createObjectStore('blob_location', { keyPath: 'id' });
      db.createObjectStore('blob_location_history', { keyPath: 'id' });
    }
    if (oldVersion < 7) {
      db.createObjectStore('asset', { keyPath: 'id' });
      db.createObjectStore('asset_blob', { keyPath: 'id' });
      db.createObjectStore('timeline_projection', { keyPath: 'id' });
    }
    if (oldVersion < 8) db.createObjectStore('timeline_event', { keyPath: 'id' });
    if (oldVersion < 10) db.createObjectStore('additional_pubkey', { keyPath: 'id' });

    // Indexes come from the shared registry so that this schema and the in-memory
    // store cannot disagree about what is indexed.
    for (const index of CATALOG_INDEXES) {
      if (oldVersion >= index.since) continue;
      transaction.objectStore(index.store).createIndex(index.name, index.keyPath);
    }
  }
}

export class MemoryCatalogStore implements CatalogStore {
  private readonly stores = new Map<StoreName, Map<IDBValidKey, unknown>>();
  // Real index buckets, not a filter over every record. A linear stand-in would let
  // an indexed read look correct in tests while staying proportional to the catalog,
  // which is precisely the regression the scale tests exist to catch.
  private readonly indexes = new Map<string, Map<string, Map<IDBValidKey, unknown>>>();

  async get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
    return this.getStore(store).get(key) as T | undefined;
  }

  async put<T>(store: StoreName, value: T): Promise<void> {
    const key = recordKeyForStore(store, value);
    const previous = this.getStore(store).get(key);
    const record = structuredClone(value);
    this.getStore(store).set(key, record);
    for (const definition of CATALOG_INDEXES) {
      if (definition.store !== store) continue;
      const bucket = this.getIndex(store, definition.name);
      const previousKey = previous === undefined ? undefined : indexKeyOf(previous, definition.keyPath);
      if (previousKey !== undefined) bucket.get(previousKey)?.delete(key);
      const indexKey = indexKeyOf(record, definition.keyPath);
      if (indexKey === undefined) continue;
      let entries = bucket.get(indexKey);
      if (!entries) {
        entries = new Map();
        bucket.set(indexKey, entries);
      }
      entries.set(key, record);
    }
  }

  async putMany<T>(store: StoreName, values: T[]): Promise<void> {
    for (const value of values) await this.put(store, value);
  }

  async getAll<T>(store: StoreName): Promise<T[]> {
    return [...this.getStore(store).values()].map(value => structuredClone(value) as T);
  }

  async getAllFromIndex<T>(store: StoreName, index: string, key: IDBValidKey): Promise<T[]> {
    indexDefinition(store, index);
    const entries = this.getIndex(store, index).get(serializeIndexKey(key));
    return entries ? [...entries.values()].map(value => structuredClone(value) as T) : [];
  }
  async delete(store: StoreName, key: IDBValidKey): Promise<void> {
    const previous = this.getStore(store).get(key);
    if (previous === undefined) return;
    this.getStore(store).delete(key);
    for (const definition of CATALOG_INDEXES) {
      if (definition.store !== store) continue;
      // `indexKeyOf` returns the serialized bucket key the put path indexed under.
      const bucketKey = indexKeyOf(previous, definition.keyPath);
      if (bucketKey === undefined) continue;
      this.getIndex(store, definition.name).get(bucketKey)?.delete(key);
    }
  }
  async reset(): Promise<void> {
    this.stores.clear();
    this.indexes.clear();
  }

  private getStore(name: StoreName) {
    let store = this.stores.get(name);
    if (!store) {
      store = new Map();
      this.stores.set(name, store);
    }
    return store;
  }

  private getIndex(store: StoreName, name: string) {
    const id = `${store}.${name}`;
    let index = this.indexes.get(id);
    if (!index) {
      index = new Map();
      this.indexes.set(id, index);
    }
    return index;
  }
}

function serializeIndexKey(key: IDBValidKey): string {
  return JSON.stringify(Array.isArray(key) ? key : [key]);
}

/**
 * IndexedDB leaves a record out of an index when any key path component is missing,
 * and the in-memory store has to agree, or a test would see rows the browser hides.
 */
function indexKeyOf(record: unknown, keyPath: string | string[]): string | undefined {
  const fields = Array.isArray(keyPath) ? keyPath : [keyPath];
  const values: IDBValidKey[] = [];
  for (const field of fields) {
    const value = (record as Record<string, unknown>)[field];
    if (value === undefined || value === null) return undefined;
    values.push(value as IDBValidKey);
  }
  return serializeIndexKey(values);
}

const KEY_FIELD_BY_STORE: Record<StoreName, string> = {
  profile: 'pubkey',
  additional_pubkey: 'id',
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
  blob_location: 'id',
  blob_location_history: 'id',
  asset: 'id',
  asset_blob: 'id',
  timeline_projection: 'id',
  timeline_event: 'id',
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
  relaySyncs: Array<{
    relayUrl: string;
    state: 'pending' | 'complete' | 'failed';
    cursor?: number;
    error?: string;
    received: number;
  }>;
  reverseLookups: { pending: number; failed: number };
  enrichments: { pending: number; failed: number; truncated: number };
  lastSyncAt?: number;
};
type BlobLocationRecord = {
  id: string;
  sha256: string;
  serverId: string;
  state: 'present' | 'absent';
  firstPresentAt?: number;
  lastPresentAt?: number;
  lastCheckedAt: number;
  nextCheckAt: number;
  reportedSize?: number;
  reportedMimeType?: string;
  canonicalUrl: string;
  consecutiveFailures: number;
  source: 'server-list' | 'delete';
};
type BlobLocationHistoryRecord = {
  id: string;
  sha256: string;
  serverId: string;
  observedAt: number;
  previousState?: string;
  newState: 'present' | 'absent';
  reason?: string;
};

export type BlobRemoval = { sha256: string; serverUrl: string; reason?: string };

export type ServerListInput = {
  server: { url: string; type: CatalogServerType };
  blobs?: BlobDescriptor[];
  cursor?: string;
  state: ServerListState;
  error?: string;
  received?: number;
  /** `blobs` is the server's complete current listing (not one page of a
      still-in-progress paginated fetch). Anything previously recorded
      present on this server but absent from this list gets marked removed,
      so a rescan clears files that were deleted directly on the server. */
  full?: boolean;
};

export type EventPageLoader = (input: { until?: number; limit: number }) => Promise<NostrEvent[]>;

export type ReverseLookupBatchLoader = (hashes: string[]) => Promise<NostrEvent[]>;
export type HlsPlaylistLoader = (url: string) => Promise<string>;
export type HlsExpansionLimits = { maxDepth: number; maxDescendants: number };
export type BlobPrefixLoader = (
  url: string,
  maxBytes: number
) => Promise<{ bytes: ArrayBuffer; mimeType?: string; size?: number; truncated: boolean }>;
export class Catalog {
  constructor(readonly store: CatalogStore) {}

  /** Wipes derived catalog data while preserving the account's configured
      read-only pubkeys, so Rescan can rebuild their content too. */
  async reset(): Promise<void> {
    const additionalPubkeys = await this.store.getAll<AdditionalPubkeyRecord>('additional_pubkey');
    await this.store.reset();
    await this.store.putMany('additional_pubkey', additionalPubkeys);
  }

  async listAdditionalPubkeys(ownerPubkey: string): Promise<AdditionalPubkey[]> {
    return (await this.store.getAllFromIndex<AdditionalPubkeyRecord>('additional_pubkey', 'by_owner', ownerPubkey))
      .map(({ pubkey, relayHints, addedAt }) => ({ pubkey, relayHints, addedAt }))
      .sort((a, b) => a.addedAt - b.addedAt);
  }

  async addAdditionalPubkey(ownerPubkey: string, source: Omit<AdditionalPubkey, 'addedAt'>): Promise<void> {
    const owner = ownerPubkey.toLowerCase();
    const pubkey = source.pubkey.toLowerCase();
    if (!HASH_PATTERN.test(owner) || !HASH_PATTERN.test(pubkey)) throw new Error('Invalid pubkey');
    if (owner === pubkey) throw new Error('The signed-in pubkey is already included');
    const id = `${owner}:${pubkey}`;
    const existing = await this.store.get<AdditionalPubkeyRecord>('additional_pubkey', id);
    await this.store.put<AdditionalPubkeyRecord>('additional_pubkey', {
      id,
      ownerPubkey: owner,
      pubkey,
      relayHints: [...new Set(source.relayHints.map(url => url.trim()).filter(Boolean))],
      addedAt: existing?.addedAt ?? Date.now(),
    });
    this.changed(owner);
  }

  async removeAdditionalPubkey(ownerPubkey: string, pubkey: string): Promise<void> {
    const owner = ownerPubkey.toLowerCase();
    const source = pubkey.toLowerCase();
    await this.store.delete('additional_pubkey', `${owner}:${source}`);

    const affectedHashes = new Set<string>();
    const removedEventIds: string[] = [];
    const profileEvents = await this.store.getAllFromIndex<ProfileEventRecord>('profile_event', 'by_pubkey', owner);
    for (const profileEvent of profileEvents) {
      if (profileEvent.source !== 'additional') continue;
      const event = await this.store.get<CatalogEventRecord>('catalog_event', profileEvent.eventId);
      if (event?.pubkey !== source) continue;
      removedEventIds.push(profileEvent.eventId);
      await this.store.delete('profile_event', profileEvent.id);
      await this.store.delete('timeline_event', profileEvent.id);
      for (const reference of await this.store.getAllFromIndex<EventReferenceRecord>(
        'event_reference',
        'by_profile_event',
        [owner, profileEvent.eventId]
      )) {
        if (reference.sha256) affectedHashes.add(reference.sha256);
        await this.store.delete('event_reference', reference.id);
      }
      for (const observation of await this.store.getAllFromIndex<EventRelayRecord>(
        'event_relay_observation',
        'by_profile_event',
        [owner, profileEvent.eventId]
      )) {
        await this.store.delete('event_relay_observation', observation.id);
      }
      for (const evidence of await this.store.getAllFromIndex<EvidenceRecord>(
        'profile_blob_evidence',
        'by_source',
        ['additional-event', profileEvent.eventId]
      )) {
        if (evidence.pubkey !== owner) continue;
        affectedHashes.add(evidence.sha256);
        await this.store.delete('profile_blob_evidence', evidence.evidenceId);
      }
    }

    for (const run of await this.store.getAllFromIndex<EventSyncRunRecord>('event_sync_run', 'by_pubkey', owner)) {
      if (run.sourcePubkey === source) await this.store.delete('event_sync_run', run.id);
    }
    for (const sha256 of affectedHashes) {
      const remaining = await this.store.getAllFromIndex<EvidenceRecord>(
        'profile_blob_evidence',
        'by_profile_hash',
        [owner, sha256]
      );
      if (remaining.length === 0) await this.store.delete('profile_blob_membership', `${owner}:${sha256}`);
    }

    const remainingProfileEvents = await this.store.getAll<ProfileEventRecord>('profile_event');
    for (const eventId of removedEventIds) {
      if (remainingProfileEvents.some(event => event.eventId === eventId)) continue;
      for (const url of await this.store.getAll<BlobUrlRecord>('blob_url')) {
        if (url.sourceType === 'event' && (url.sourceId === eventId || url.sourceId.startsWith(`${eventId}:`))) {
          await this.store.delete('blob_url', url.id);
        }
      }
      for (const fact of await this.store.getAll<MetadataFactRecord>('metadata_fact')) {
        if (fact.sourceType === 'event' && fact.sourceId === eventId) {
          await this.store.delete('metadata_fact', fact.id);
        }
      }
    }
    await this.touchProfileMutation(owner);
    this.changed(owner);
  }

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
      received: input.received ?? input.blobs?.length ?? previousRun?.received ?? 0,
    });

    for (const descriptor of input.blobs ?? []) {
      await this.ingestBlob(pubkey, descriptor, {
        evidenceType: 'server-list',
        sourceId: serverId,
        relationRole: 'main',
        depth: 0,
        discoveredAt: now,
      });
      // The server just told us it holds this blob - that's direct, authoritative
      // presence evidence, not something the HTTP-probe replica check should have
      // to rediscover before the server filter (or replica count) can see it.
      // One exception: a probe-observed 404/410 outranks the listing's claim
      // (Primal keeps listing blobs it has already deleted), and only a fresh
      // probe may flip absence back - the claim here must not resurrect it.
      const id = `${descriptor.sha256}:${serverId}`;
      const previous = await this.store.get<BlobLocationRecord>('blob_location', id);
      if (previous?.state === 'absent') continue;
      await this.store.put<BlobLocationRecord>('blob_location', {
        id,
        sha256: descriptor.sha256,
        serverId,
        state: 'present',
        firstPresentAt: previous?.firstPresentAt ?? now,
        lastPresentAt: now,
        lastCheckedAt: now,
        nextCheckAt: now + 24 * 60 * 60_000,
        reportedSize: descriptor.size,
        reportedMimeType: descriptor.type,
        canonicalUrl: descriptor.url,
        consecutiveFailures: 0,
        source: 'server-list',
      });
    }
    if (input.full && input.blobs) {
      const receivedHashes = new Set(input.blobs.map(blob => blob.sha256));
      const present = await this.store.getAllFromIndex<BlobLocationRecord>('blob_location', 'by_server_state', [
        serverId,
        'present',
      ]);
      const missing = present.filter(location => !receivedHashes.has(location.sha256));
      if (missing.length > 0) {
        await this.recordBlobsRemoved(
          pubkey,
          missing.map(location => ({ sha256: location.sha256, serverUrl: serverId, reason: 'rescan' }))
        );
      }
    }
    this.changed(pubkey);
  }
  /**
   * The delete dialog just watched a server confirm the blob is gone (deleted,
   * or already a 404) - that's the same kind of direct, authoritative evidence
   * `ingestServerList`'s presence write relies on, just for the opposite
   * transition. Recording it here means the server filter and replica counts
   * reflect the deletion immediately, instead of waiting for the next HTTP
   * probe to notice absence on its own schedule.
   */
  async recordBlobsRemoved(pubkey: string, removals: BlobRemoval[]): Promise<void> {
    const now = Date.now();
    for (const { sha256, serverUrl, reason } of removals) {
      const serverId = normalizeServerUrl(serverUrl);
      const id = `${sha256}:${serverId}`;
      const previous = await this.store.get<BlobLocationRecord>('blob_location', id);
      if (previous?.state === 'absent') continue;
      await this.store.put<BlobLocationRecord>('blob_location', {
        id,
        sha256,
        serverId,
        state: 'absent',
        firstPresentAt: previous?.firstPresentAt,
        lastPresentAt: previous?.lastPresentAt,
        lastCheckedAt: now,
        nextCheckAt: now + 24 * 60 * 60_000,
        canonicalUrl: previous?.canonicalUrl ?? `${serverUrl}/${sha256}`,
        consecutiveFailures: (previous?.consecutiveFailures ?? 0) + 1,
        source: 'delete',
      });
      await this.store.put<BlobLocationHistoryRecord>('blob_location_history', {
        id: `${id}:${now}:${previous?.state ?? 'none'}:absent`,
        sha256,
        serverId,
        observedAt: now,
        previousState: previous?.state,
        newState: 'absent',
        reason,
      });
    }
    if (removals.length > 0) {
      for (const sha256 of new Set(removals.map(removal => removal.sha256))) {
        await this.purgeBlobIfGoneEverywhere(pubkey, sha256);
      }
      this.changed(pubkey);
    }
  }

  /**
   * A blob the delete dialog removed from its last known server is no longer in
   * the user's catalog: its identity and enrichment rows (blob, server-listed
   * urls, evidence, extractor results, facts) go. Locations stay: their 'absent'
   * rows are the direct evidence that lets a surviving event asset project as
   * 'unavailable' rather than 'unknown', and the prober re-derives them from the
   * membership anyway. The membership stays too, so an event referencing the
   * hash keeps rendering; the location history stays as the audit trail.
   */
  private async purgeBlobIfGoneEverywhere(pubkey: string, sha256: string): Promise<void> {
    const locations = await this.store.getAllFromIndex<BlobLocationRecord>('blob_location', 'by_sha256', sha256);
    // An 'unreachable' or 'unauthorized' server knows something we do not; only
    // when every known location says 'absent' is the file gone everywhere we know of.
    if (locations.some(location => location.state !== 'absent')) return;
    await this.store.delete('blob', sha256);
    for (const url of await this.store.getAllFromIndex<BlobUrlRecord>('blob_url', 'by_sha256', sha256)) {
      // URLs declared by the blob's own events or playlist survive: they are part
      // of that content's knowledge, not of the server listing being withdrawn.
      if (url.sourceType === 'server') await this.store.delete('blob_url', url.id);
    }
    for (const evidence of await this.store.getAllFromIndex<EvidenceRecord>(
      'profile_blob_evidence',
      'by_profile_hash',
      [pubkey, sha256]
    )) {
      await this.store.delete('profile_blob_evidence', evidence.evidenceId);
    }
    for (const result of await this.store.getAllFromIndex<ExtractorResultRecord>(
      'extractor_result',
      'by_sha256',
      sha256
    )) {
      await this.store.delete('extractor_result', result.id);
    }
    for (const fact of await this.store.getAllFromIndex<MetadataFactRecord>('metadata_fact', 'by_subject', sha256)) {
      await this.store.delete('metadata_fact', fact.id);
    }
    for (const relationship of await this.store.getAllFromIndex<BlobRelationshipRecord>(
      'blob_relationship',
      'by_from_sha256',
      sha256
    )) {
      await this.store.delete('blob_relationship', relationship.id);
    }
    for (const job of await this.store.getAll<ReverseLookupJobRecord>('reverse_lookup_job')) {
      if (job.pubkey === pubkey && job.sha256 === sha256) await this.store.delete('reverse_lookup_job', job.id);
    }
  }

  async ingestUpload(
    pubkey: string,
    server: { url: string; type: CatalogServerType },
    descriptor: BlobDescriptor,
    mirrored = false
  ): Promise<void> {
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
    this.changed(pubkey);
  }

  async ingestAuthoredEvents(pubkey: string, events: NostrEvent[], relayUrl: string): Promise<void> {
    const now = Date.now();
    await this.ensureProfile(pubkey, now);
    for (const event of events) await this.persistEvent(pubkey, event, relayUrl, now);
    this.changed(pubkey);
  }

  async ingestAdditionalEvents(
    ownerPubkey: string,
    sourcePubkey: string,
    events: NostrEvent[],
    relayUrl: string,
    serverUrls: string[] = []
  ): Promise<void> {
    const now = Date.now();
    await this.ensureProfile(ownerPubkey, now);
    for (const event of events.filter(event => event.pubkey === sourcePubkey)) {
      await this.persistEvent(ownerPubkey, event, relayUrl, now, 'additional', undefined, serverUrls);
    }
    this.changed(ownerPubkey);
  }

  async syncAuthoredEvents(pubkey: string, relayUrl: string, loadPage: EventPageLoader, limit = 500): Promise<void> {
    return this.syncEventSource(pubkey, pubkey, 'authored', relayUrl, loadPage, [], limit);
  }

  async syncAdditionalEvents(
    ownerPubkey: string,
    sourcePubkey: string,
    relayUrl: string,
    loadPage: EventPageLoader,
    serverUrls: string[] = [],
    limit = 500
  ): Promise<void> {
    return this.syncEventSource(ownerPubkey, sourcePubkey, 'additional', relayUrl, loadPage, serverUrls, limit);
  }

  private async syncEventSource(
    pubkey: string,
    sourcePubkey: string,
    source: 'authored' | 'additional',
    relayUrl: string,
    loadPage: EventPageLoader,
    serverUrls: string[],
    limit: number
  ): Promise<void> {
    const id =
      source === 'authored'
        ? `${pubkey}:${relayUrl}:authored-events`
        : `${pubkey}:${sourcePubkey}:${relayUrl}:additional-events`;
    const previous = await this.store.get<EventSyncRunRecord>('event_sync_run', id);
    let until = previous?.state === 'pending' ? previous.cursor : undefined;
    let received = previous?.state === 'pending' ? previous.received : 0;
    const startedAt = previous?.state === 'pending' ? previous.startedAt : Date.now();
    const record = (
      state: EventSyncRunRecord['state'],
      extra: Partial<Pick<EventSyncRunRecord, 'cursor' | 'completedAt' | 'error'>> = {}
    ) =>
      this.store.put<EventSyncRunRecord>('event_sync_run', {
        id,
        pubkey,
        sourcePubkey: source === 'additional' ? sourcePubkey : undefined,
        relayUrl,
        state,
        startedAt,
        received,
        ...extra,
      });

    await record('pending', { cursor: until });
    try {
      while (true) {
        const page = await loadPage({ until, limit });
        const authored = page.filter(event => event.pubkey === sourcePubkey);
        if (source === 'additional')
          await this.ingestAdditionalEvents(pubkey, sourcePubkey, authored, relayUrl, serverUrls);
        else await this.ingestAuthoredEvents(pubkey, authored, relayUrl);
        received += authored.length;
        const oldest = page.reduce<number | undefined>(
          (value, event) => (value === undefined ? event.created_at : Math.min(value, event.created_at)),
          undefined
        );
        if (page.length < limit || oldest === undefined) break;
        until = oldest - 1;
        await record('pending', { cursor: until });
      }
      await record('complete', { completedAt: Date.now() });
      await this.touchProfileSync(pubkey);
      this.changed(pubkey);
    } catch (error) {
      await record('failed', { cursor: until, error: error instanceof Error ? error.message : String(error) });
      this.changed(pubkey);
      throw error;
    }
  }

  async reprojectEvents(pubkey: string): Promise<void> {
    const profile = await this.store.get<ProfileRecord>('profile', pubkey);
    if (!profile || profile.eventExtractorVersion === EVENT_EXTRACTOR_VERSION) return;
    const profileEvents = (await this.store.getAll<ProfileEventRecord>('profile_event')).filter(
      event => event.pubkey === pubkey
    );
    const now = Date.now();
    for (const profileEvent of profileEvents) {
      const record = await this.store.get<CatalogEventRecord>('catalog_event', profileEvent.eventId);
      if (record)
        await this.persistEvent(pubkey, record.event, undefined, now, profileEvent.source, profileEvent.rootSha256);
    }
    await this.store.put<ProfileRecord>('profile', { ...profile, eventExtractorVersion: EVENT_EXTRACTOR_VERSION });
    await this.touchProfileMutation(pubkey);
    // `changed` also reaches the main thread from inside the worker; a bare
    // `window.dispatchEvent` here notified nobody once the catalog moved off-thread.
    this.changed(pubkey);
  }

  async syncReverseLookups(
    pubkey: string,
    relayUrl: string,
    loadBatch: ReverseLookupBatchLoader,
    batchSize = 50,
    maxHashes = 200
  ): Promise<void> {
    const memberships = (await this.store.getAll<MembershipRecord>('profile_blob_membership')).filter(
      membership => membership.pubkey === pubkey && membership.status === 'active'
    );
    const completed = new Set(
      (await this.store.getAll<ReverseLookupJobRecord>('reverse_lookup_job'))
        .filter(job => job.pubkey === pubkey && job.relayUrl === relayUrl && job.state === 'complete')
        .map(job => job.sha256)
    );
    const pending = memberships
      .map(membership => membership.sha256)
      .filter(sha256 => !completed.has(sha256))
      .slice(0, maxHashes);
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
        const serverUrls = await this.loadServerBaseUrls(pubkey);
        for (const sha256 of hashes) {
          const matching = events.filter(event =>
            extractEventReferences(event, serverUrls).some(ref => ref.sha256 === sha256)
          );
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
        this.changed(pubkey);
        throw error;
      }
    }
    this.changed(pubkey);
  }

  async enrichHls(
    pubkey: string,
    rootSha256: string,
    loadPlaylist: HlsPlaylistLoader,
    limits: HlsExpansionLimits = { maxDepth: 3, maxDescendants: 1000 }
  ): Promise<void> {
    const resultId = `${rootSha256}:hls:${HLS_EXTRACTOR_VERSION}`;
    const existing = await this.store.get<ExtractorResultRecord>('extractor_result', resultId);
    // A completed expansion that moved descendants is final. A completed one that
    // moved none proved nothing: a single transient error page answered 200 once and
    // wedged the playlist behind it forever. Every caller here is already gated on
    // playlist evidence, so re-proving a zero-descendant candidate costs one ranged
    // GET, not a sweep.
    if (existing?.state === 'complete' && (!existing.payload || JSON.parse(existing.payload).descendants > 0))
      return;
    // An earlier reader stopped at the first kilobyte of a playlist whose host sends
    // no `content-range`, so its videos were expanded into a handful of segments
    // instead of hundreds. Those have to be read again - and a version-1 run that
    // found nothing keeps its veto: those were probed en masse, and re-reading all
    // of them would cost thousands of pointless requests.
    const priorRun = await this.store.get<ExtractorResultRecord>('extractor_result', `${rootSha256}:hls:1`);
    if (priorRun?.state === 'complete' && priorRun.payload && JSON.parse(priorRun.payload).descendants === 0) return;
    // Reading every blob_url row per playlist candidate turned enrichment into an
    // O(candidates × urls) scan - 11 000 rows re-read for each of hundreds of
    // candidates, all of it blocking the worker.
    const urls = await this.store.getAllFromIndex<BlobUrlRecord>('blob_url', 'by_sha256', rootSha256);
    // A URL from a server listing is one a server answered for; a URL lifted from an
    // event or a manifest may name a host that never had the file.
    const rootUrl = (urls.find(url => url.sourceType === 'server') ?? urls[0])?.url;
    if (!rootUrl) {
      await this.store.put<ExtractorResultRecord>('extractor_result', {
        id: resultId,
        sha256: rootSha256,
        name: 'hls',
        version: HLS_EXTRACTOR_VERSION,
        state: 'failed',
        completedAt: Date.now(),
        error: 'No URL is known for this file',
      });
      return;
    }
    await this.store.put<ExtractorResultRecord>('extractor_result', {
      id: resultId,
      sha256: rootSha256,
      name: 'hls',
      version: HLS_EXTRACTOR_VERSION,
      state: 'pending',
    });
    const queue: Array<{ url: string; sha256: string; depth: number }> = [
      { url: rootUrl, sha256: rootSha256, depth: 0 },
    ];
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
        const playlistBlob = await this.store.get<BlobRecord>('blob', current.sha256);
        if (playlistBlob && playlistBlob.verifiedMimeType !== 'application/vnd.apple.mpegurl') {
          await this.store.put<BlobRecord>('blob', {
            ...playlistBlob,
            verifiedMimeType: 'application/vnd.apple.mpegurl',
            lastEnrichedAt: Date.now(),
          });
        }
        const parsed = parseHlsPlaylist(current.url, body);
        const duration = parsed.segments.reduce((total, segment) => total + (segment.duration ?? 0), 0);
        if (duration > 0)
          await this.recordFact(current.sha256, 'playlist', 'duration', duration, 'number', 'content', current.sha256);
        for (const child of [
          ...parsed.playlistUrls.map(url => ({ url, type: 'playlist' as const })),
          ...parsed.segments.map(segment => ({
            url: segment.url,
            type: segment.isInit ? ('init-segment' as const) : ('segment' as const),
          })),
        ]) {
          descendants += 1;
          const childSha256 = extractHashFromUrl(child.url)?.toLowerCase();
          const state =
            descendants > limits.maxDescendants || (child.type === 'playlist' && current.depth >= limits.maxDepth)
              ? 'truncated'
              : childSha256
                ? 'active'
                : 'unresolved';
          await this.recordRelationship(current.sha256, childSha256, child.url, child.type, rootSha256, state);
          if (state === 'truncated') {
            // Past the cap only the parent link is kept - that alone is what folds the
            // segment into its video. A long stream reaches a thousand segments, and
            // giving each one membership and URL bookkeeping made expansion take
            // minutes of worker time and left playlists stuck half-done.
            truncated = true;
            continue;
          }
          await this.recordBlobUrl(childSha256, child.url, child.type, 'manifest', rootSha256);
          if (childSha256) {
            await this.ingestBlob(
              pubkey,
              { sha256: childSha256, url: child.url, type: '', size: 0, uploaded: 0 },
              {
                evidenceType: 'manifest-child',
                sourceId: rootSha256,
                relationRole: child.type,
                depth: current.depth + 1,
                parentSha256: current.sha256,
                discoveredAt: Date.now(),
              }
            );
          }
          if (child.type === 'playlist')
            queue.push({ url: child.url, sha256: childSha256 ?? current.sha256, depth: current.depth + 1 });
        }
      }
      await this.store.put<ExtractorResultRecord>('extractor_result', {
        id: resultId,
        sha256: rootSha256,
        name: 'hls',
        version: HLS_EXTRACTOR_VERSION,
        state: truncated ? 'truncated' : 'complete',
        payload: JSON.stringify({ descendants }),
        completedAt: Date.now(),
      });
    } catch (error) {
      await this.store.put<ExtractorResultRecord>('extractor_result', {
        id: resultId,
        sha256: rootSha256,
        name: 'hls',
        version: HLS_EXTRACTOR_VERSION,
        state: 'failed',
        completedAt: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      // Every generic-typed file is a playlist candidate, so most calls here find
      // nothing. Announcing a catalog change anyway made the timeline re-project
      // thousands of times during a first sync, which is what froze Browse.
      if (descendants > 0) {
        // The projection skips itself unless the profile is marked mutated, so an
        // expansion that folded segments would otherwise stay invisible.
        await this.touchProfileMutation(pubkey);
        this.changed(pubkey);
      }
    }
  }

  /** Returns the mime type the bytes proved, so a caller can act on it - a body that
      turns out to be an HLS playlist still needs expanding. */
  async enrichBlobPrefix(
    pubkey: string,
    sha256: string,
    url: string,
    loadPrefix: BlobPrefixLoader,
    maxBytes = 512 * 1024,
    // A sweep over thousands of files would otherwise announce a catalog change per
    // file, and each announcement costs a full reprojection. It batches instead.
    notify = true
  ): Promise<string | undefined> {
    const resultId = `${sha256}:mime-header:${MIME_EXTRACTOR_VERSION}`;
    const existing = await this.store.get<ExtractorResultRecord>('extractor_result', resultId);
    // A repeat call still answers with what the bytes said last time, so a caller
    // deciding "is this a playlist?" does not have to re-fetch to find out.
    if (existing?.state === 'complete')
      return existing.payload ? (JSON.parse(existing.payload).mimeType as string | undefined) : undefined;
    await this.store.put<ExtractorResultRecord>('extractor_result', {
      id: resultId,
      sha256,
      name: 'mime-header',
      version: MIME_EXTRACTOR_VERSION,
      state: 'pending',
    });
    let recorded = false;
    try {
      const loaded = await loadPrefix(url, maxBytes);
      const bytes = new Uint8Array(loaded.bytes);
      // The header is what left half of a real catalog typed `application/octet-stream`
      // in the first place. Storing it back as a "content" fact only launders the
      // server's shrug into evidence, so a generic header is discarded outright.
      const sniffed = sniffMimeType(bytes);
      const mimeType = sniffed ?? (isGenericMimeType(loaded.mimeType) ? undefined : loaded.mimeType);
      if (mimeType) {
        await this.recordFact(sha256, 'common', 'mime_type', mimeType, 'string', 'content', resultId);
        recorded = true;
      }
      // The fact alone is not enough: it feeds display, while the catalog's own
      // questions - "which of my files are playlists?" - read the blob record. A
      // playlist proved by its bytes but left typed `application/octet-stream` here
      // was never offered for expansion again, and its segments stayed loose.
      if (sniffed) {
        const blob = await this.store.get<BlobRecord>('blob', sha256);
        if (blob && blob.verifiedMimeType !== sniffed)
          await this.store.put<BlobRecord>('blob', {
            ...blob,
            verifiedMimeType: sniffed,
            lastEnrichedAt: Date.now(),
          });
      }
      if (loaded.size !== undefined)
        await this.recordFact(sha256, 'common', 'size', loaded.size, 'number', 'content', resultId);
      const dimensions = imageDimensions(bytes, mimeType);
      if (dimensions) {
        await this.recordFact(sha256, 'image', 'width', dimensions.width, 'number', 'content', resultId);
        await this.recordFact(sha256, 'image', 'height', dimensions.height, 'number', 'content', resultId);
      }
      await this.store.put<ExtractorResultRecord>('extractor_result', {
        id: resultId,
        sha256,
        name: 'mime-header',
        version: MIME_EXTRACTOR_VERSION,
        state: 'complete',
        payload: JSON.stringify({ mimeType, truncated: loaded.truncated }),
        completedAt: Date.now(),
      });
      return mimeType;
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
      // Without the mutation stamp the projection considers itself up to date and
      // skips - so a file whose type was just proved kept showing as unclassified
      // until some unrelated write happened to move the stamp.
      if (recorded) await this.touchProfileMutation(pubkey);
      // A sniff that read nothing usable changed nothing, and a catalog-changed event
      // costs a full reprojection - too much to spend on a shrug.
      if (recorded && notify) this.changed(pubkey);
    }
  }

  async ingestId3(
    sha256: string,
    tags: { title?: string; artist?: string; album?: string; year?: string }
  ): Promise<void> {
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

  /**
   * Files the catalog itself considers playlists, whatever their server calls them:
   * a declared playlist mime, one a byte sniff proved, or an `.m3u8` URL.
   *
   * Discovery must come from the catalog, not from a server listing. A playlist
   * known only from an event or from another manifest never appears in any listing,
   * so scanning listings left those unexpanded - and their segments loose in the
   * timeline forever.
   */
  async queryPlaylistHashes(): Promise<string[]> {
    const [blobs, urls, results] = await Promise.all([
      this.store.getAll<BlobRecord>('blob'),
      this.store.getAll<BlobUrlRecord>('blob_url'),
      this.store.getAll<ExtractorResultRecord>('extractor_result'),
    ]);
    const byMime = blobs
      .filter(blob => blob.verifiedMimeType && PLAYLIST_MIME_TYPES[blob.verifiedMimeType.toLowerCase()])
      .map(blob => blob.sha256);
    // The sniff result, not the blob record, is what proves a generically-typed
    // file: a primal-style `.txt` playlist whose bytes said `#EXTM3U` stayed
    // `text/plain` in the record and was invisible to both checks below, so its
    // segments never folded.
    const bySniff = results
      .filter(
        result =>
          result.name === 'mime-header' &&
          result.state === 'complete' &&
          result.version === MIME_EXTRACTOR_VERSION &&
          !!result.payload &&
          !!PLAYLIST_MIME_TYPES[JSON.parse(result.payload).mimeType?.toLowerCase()]
      )
      .map(result => result.sha256);
    const byExtension = urls.filter(url => url.sha256 && /\.m3u8?($|[?#])/i.test(url.url)).map(url => url.sha256!);
    return [...new Set([...byMime, ...bySniff, ...byExtension])];
  }

  /**
   * Files nothing has explained yet: the server called them binary (or said nothing),
   * and their first bytes have never been read. One read settles both questions a
   * timeline has about them - what the file is, and whether it is a playlist whose
   * segments belong folded into it.
   *
   * A file that is already some playlist's child is skipped: it is shown as part of
   * that item, never as an entry of its own, so nothing on screen depends on knowing
   * what it is. In the catalog this was measured to remove two thirds of the queue.
   *
   * Smallest first: a playlist is text and text is small, so the cheap answers and
   * the ones that can collapse whole groups of entries come back first.
   */
  async queryUnidentifiedBlobs(
    pubkey: string,
    maxSize = 512 * 1024,
    limit = 5000
  ): Promise<Array<{ sha256: string; url: string }>> {
    const [memberships, blobs, urls, results, relationships] = await Promise.all([
      this.store.getAll<MembershipRecord>('profile_blob_membership'),
      this.store.getAll<BlobRecord>('blob'),
      this.store.getAll<BlobUrlRecord>('blob_url'),
      this.store.getAll<ExtractorResultRecord>('extractor_result'),
      this.store.getAll<BlobRelationshipRecord>('blob_relationship'),
    ]);
    const folded = new Set(
      relationships.flatMap(relationship => (relationship.toSha256 ? [relationship.toSha256] : []))
    );
    const active = new Set(
      memberships.filter(item => item.pubkey === pubkey && item.status === 'active').map(item => item.sha256)
    );
    // Version matters: a result from an older sniffer is not an answer any more, and
    // treating it as one is what left already-read files permanently unexplained.
    const identified = new Set(
      results
        .filter(
          result =>
            result.name === 'mime-header' && result.state === 'complete' && result.version === MIME_EXTRACTOR_VERSION
        )
        .map(result => result.sha256)
    );
    const urlsByHash = new Map<string, BlobUrlRecord[]>();
    for (const url of urls) {
      if (!url.sha256 || !/^https?:\/\//.test(url.url)) continue;
      const bucket = urlsByHash.get(url.sha256);
      if (bucket) bucket.push(url);
      else urlsByHash.set(url.sha256, [url]);
    }
    return blobs
      .filter(
        blob =>
          active.has(blob.sha256) &&
          !identified.has(blob.sha256) &&
          !folded.has(blob.sha256) &&
          (!blob.verifiedMimeType || GENERIC_MIME_TYPES[blob.verifiedMimeType.split(';', 1)[0].trim().toLowerCase()]) &&
          (blob.verifiedSize === undefined || blob.verifiedSize <= 0 || blob.verifiedSize <= maxSize)
      )
      .sort((a, b) => (a.verifiedSize ?? 0) - (b.verifiedSize ?? 0))
      .flatMap(blob => {
        const candidates = urlsByHash.get(blob.sha256);
        if (!candidates) return [];
        const url = (candidates.find(item => item.sourceType === 'server') ?? candidates[0]).url;
        return [{ sha256: blob.sha256, url }];
      })
      .slice(0, limit);
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
      serverLists: runs
        .filter(item => item.pubkey === pubkey)
        .map(({ serverId, state, cursor, error, received }) => ({ serverId, state, cursor, error, received })),
      relaySyncs: relayRuns
        .filter(item => item.pubkey === pubkey)
        .map(({ relayUrl, state, cursor, error, received }) => ({ relayUrl, state, cursor, error, received })),
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
    if (!existing)
      await this.store.put<ProfileRecord>('profile', {
        pubkey,
        createdAt: now,
        catalogVersion: DATABASE_VERSION,
        eventExtractorVersion: EVENT_EXTRACTOR_VERSION,
      });
  }

  private async upsertServer(pubkey: string, serverId: string, serverType: CatalogServerType, now: number) {
    const server = await this.store.get<ServerRecord>('server', serverId);
    await this.store.put<ServerRecord>(
      'server',
      server ?? { serverId, baseUrl: serverId, serverType, capabilities: ['list'], lastCapabilityCheckAt: now }
    );
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

  private async ingestBlob(
    pubkey: string,
    descriptor: BlobDescriptor,
    evidence: Omit<EvidenceRecord, 'evidenceId' | 'pubkey' | 'sha256'>
  ) {
    const sha256 = descriptor.sha256.toLowerCase();
    if (!HASH_PATTERN.test(sha256)) throw new Error(`Invalid SHA-256 hash: ${descriptor.sha256}`);
    const blob = await this.store.get<BlobRecord>('blob', sha256);
    const descriptorHasMetadata = descriptor.size > 0 || descriptor.type !== '';
    const descriptorUploadedAt = timestampInMilliseconds(descriptor.uploaded);
    await this.store.put<BlobRecord>('blob', {
      sha256,
      verifiedSize:
        blob?.verifiedSize && blob.verifiedSize > 0
          ? blob.verifiedSize
          : descriptorHasMetadata
            ? descriptor.size
            : undefined,
      verifiedMimeType: blob?.verifiedMimeType || descriptor.type || undefined,
      uploadedAt: blob?.uploadedAt ?? descriptorUploadedAt,
      firstSeenAt: blob?.firstSeenAt ?? evidence.discoveredAt,
      lastEnrichedAt: blob?.lastEnrichedAt,
    });
    if (descriptor.url) {
      const sourceType =
        evidence.evidenceType === 'manifest-child'
          ? 'manifest'
          : evidence.evidenceType === 'authored-event' ||
              evidence.evidenceType === 'event-reference' ||
              evidence.evidenceType === 'reverse-event'
            ? 'event'
            : 'server';
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

  private async recordBlobUrl(
    sha256: string | undefined,
    url: string,
    role: string,
    sourceType: BlobUrlRecord['sourceType'],
    sourceId: string
  ) {
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

  private async recordRelationship(
    fromSha256: string,
    toSha256: string | undefined,
    toUrl: string,
    type: BlobRelationshipRecord['type'],
    sourceId: string,
    state: BlobRelationshipRecord['state']
  ) {
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

  private async recordFact(
    subjectId: string,
    namespace: string,
    field: string,
    value: string | number,
    valueType: MetadataFactRecord['valueType'],
    sourceType: MetadataFactRecord['sourceType'],
    sourceId: string
  ) {
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

  private async loadServerBaseUrls(pubkey: string): Promise<string[]> {
    const servers = await this.store.getAll<ServerRecord>('server');
    const profileServers = (await this.store.getAll<ProfileServerRecord>('profile_server')).filter(
      ps => ps.pubkey === pubkey && ps.enabled
    );
    return profileServers
      .map(ps => servers.find(s => s.serverId === ps.serverId))
      .filter((s): s is ServerRecord => !!s)
      .map(s => s.baseUrl);
  }

  private async persistEvent(
    pubkey: string,
    event: NostrEvent,
    relayUrl: string | undefined,
    now: number,
    source: 'authored' | 'additional' | 'reverse' = 'authored',
    rootSha256?: string,
    readOnlyServerUrls: string[] = []
  ) {
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
      source: source === 'additional' && profileEvent ? profileEvent.source : source,
      rootSha256,
    });
    const timelineEvent = extractTimelineEventMetadata(event);
    await this.store.put<TimelineEventRecord>('timeline_event', { id: profileEventId, pubkey, ...timelineEvent });
    if (relayUrl) {
      const relayId = `${pubkey}:${event.id}:${relayUrl}`;
      const relay = await this.store.get<EventRelayRecord>('event_relay_observation', relayId);
      await this.store.put<EventRelayRecord>('event_relay_observation', {
        id: relayId,
        pubkey,
        eventId: event.id,
        relayUrl,
        firstSeenAt: relay?.firstSeenAt ?? now,
        lastSeenAt: now,
      });
    }
    const serverUrls = normalizeHttpServerUrls([
      ...(source === 'additional' ? readOnlyServerUrls : await this.loadServerBaseUrls(pubkey)),
      ...event.tags.filter(tag => tag[0] === 'server').map(tag => tag[1]),
    ]);
    const references = extractEventReferences(event, serverUrls);
    for (const [index, reference] of references.entries()) {
      await this.persistEventReference(pubkey, event.id, reference, index, now);
      if (reference.mimeType && reference.sha256) {
        await this.recordFact(reference.sha256, 'event', 'mime_type', reference.mimeType, 'string', 'event', event.id);
      }
      if (reference.dimensions && reference.sha256) {
        await this.recordFact(
          reference.sha256,
          'event',
          'dimensions',
          reference.dimensions,
          'string',
          'event',
          event.id
        );
      }
      if (reference.url) await this.recordBlobUrl(reference.sha256, reference.url, reference.role, 'event', event.id);
      if (source === 'additional' && reference.sha256) {
        for (const serverUrl of serverUrls) {
          await this.recordBlobUrl(
            reference.sha256,
            `${serverUrl}/${reference.sha256}`,
            reference.role,
            'event',
            `${event.id}:${serverUrl}`
          );
        }
      }
      if ((source === 'authored' || source === 'additional') && reference.sha256) {
        await this.ingestBlob(pubkey, descriptorFromReference(reference), {
          evidenceType:
            source === 'additional'
              ? 'additional-event'
              : reference.isDirect
                ? 'authored-event'
                : 'event-reference',
          sourceId: event.id,
          relationRole: reference.role,
          depth: reference.isDirect ? 0 : 1,
          discoveredAt: now,
        });
      }
      const isReverseCompanion =
        reference.role === 'image' ||
        reference.role === 'thumbnail' ||
        reference.role === 'fallback' ||
        reference.role === 'mirror' ||
        reference.role === 'text-track';
      if (
        source === 'reverse' &&
        rootSha256 &&
        reference.sha256 &&
        reference.sha256 !== rootSha256 &&
        isReverseCompanion
      ) {
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

  private async persistEventReference(
    pubkey: string,
    eventId: string,
    reference: EventReference,
    index: number,
    now: number
  ) {
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
    if (!profile) return;
    await this.store.put<ProfileRecord>('profile', {
      ...profile,
      lastSyncAt: Date.now(),
      lastMutationAt: nextMutationStamp(profile),
    });
  }

  /**
   * `projectedAt` is the moment the run *started*, so that a mutation arriving
   * mid-run still counts as newer and `queryCatalogTimeline` can treat every
   * projection carrying an older stamp as a leftover of a previous run.
   */
  async markProjectionComplete(pubkey: string, projectedAt = Date.now()): Promise<void> {
    const profile = await this.store.get<ProfileRecord>('profile', pubkey);
    if (profile)
      await this.store.put<ProfileRecord>('profile', {
        ...profile,
        lastProjectedAt: projectedAt,
        projectionVersion: PROJECTION_VERSION,
      });
  }

  /** The stamp a projection must carry to still be part of the current timeline. */
  async getProjectionStamp(pubkey: string): Promise<number> {
    const profile = await this.store.get<ProfileRecord>('profile', pubkey);
    return profile?.lastProjectedAt ?? 0;
  }

  async updateBlobServerMetadata(sha256: string, size?: number, mimeType?: string): Promise<void> {
    if (!mimeType && (!size || size <= 0)) return;
    const blob = await this.store.get<BlobRecord>('blob', sha256);
    if (!blob) return;
    const hadUpdate = (!blob.verifiedMimeType && mimeType) || (!blob.verifiedSize && size && size > 0);
    if (!blob.verifiedMimeType && mimeType) blob.verifiedMimeType = mimeType;
    if (!blob.verifiedSize && size && size > 0) blob.verifiedSize = size;
    if (hadUpdate) {
      blob.lastEnrichedAt = Date.now();
      await this.store.put('blob', blob);
    }
  }

  async isProjectionStale(pubkey: string): Promise<boolean> {
    const profile = await this.store.get<ProfileRecord>('profile', pubkey);
    if (!profile?.lastProjectedAt) return true;
    // A projection written before the current shape lacks the run stamp the query
    // filters on, so it has to be rebuilt once even when nothing else changed.
    if (profile.projectionVersion !== PROJECTION_VERSION) return true;
    return (profile.lastMutationAt ?? 0) > profile.lastProjectedAt;
  }

  /** Set by the worker host so change notifications leave the worker. */
  onChanged?: (pubkey?: string) => void;

  private changed(pubkey?: string) {
    this.onChanged?.(pubkey);
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('bouquet-catalog-changed'));
  }

  private async touchProfileMutation(pubkey: string) {
    const profile = await this.store.get<ProfileRecord>('profile', pubkey);
    if (!profile) return;
    const lastMutationAt = nextMutationStamp(profile);
    if (lastMutationAt !== profile.lastMutationAt)
      await this.store.put<ProfileRecord>('profile', { ...profile, lastMutationAt });
  }
}

/**
 * A wall-clock millisecond is too coarse to order a mutation against a projection
 * that starts in the same one: `isProjectionStale` reads `lastMutationAt >
 * lastProjectedAt`, and `markProjectionComplete` stamps run *start* so mid-run
 * mutations count as newer. A mutation must therefore outrank not only the last
 * mutation but also the last projection start, not merely tick with the clock.
 */
function nextMutationStamp(profile: ProfileRecord): number {
  return Math.max(Date.now(), (profile.lastMutationAt ?? 0) + 1, (profile.lastProjectedAt ?? 0) + 1);
}
function timestampInMilliseconds(value: number | undefined): number | undefined {
  if (!value || !Number.isFinite(value)) return undefined;
  return value < 1_000_000_000_000 ? value * 1000 : value;
}

function descriptorFromReference(reference: EventReference): BlobDescriptor {
  return { sha256: reference.sha256!, url: reference.url ?? '', type: '', size: 0, uploaded: 0 };
}

/** Magic-byte sniffing for the formats a media catalog actually holds. PNG/JPEG/GIF
    alone left every MP4, fMP4 segment, WebM and WebP typed `unknown`, which is most
    of what a Blossom server serves as `application/octet-stream`. */
function sniffMimeType(bytes: Uint8Array): string | undefined {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return 'image/gif';
  if (bytes.length >= 5 && ascii(0, 5) === '%PDF-') return 'application/pdf';
  if (bytes.length >= 3 && ascii(0, 3) === 'ID3') return 'audio/mpeg';
  // ISO base media: `....ftyp<brand>`. fMP4 HLS segments and MOV land here too.
  if (bytes.length >= 12 && ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (brand === 'qt  ') return 'video/quicktime';
    if (brand.startsWith('M4A')) return 'audio/mp4';
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (brand.startsWith('hei') || brand.startsWith('hev')) return 'image/heic';
    return 'video/mp4';
  }

  // Only an fMP4 *init* segment carries `ftyp`. A media segment starts at `styp`,
  // `moof` or `sidx`, which is why 862 of the first 908 sniffs in a real catalog came
  // back as "still binary" - they were the segments of HLS videos.
  if (bytes.length >= 8 && ['styp', 'moof', 'sidx', 'mdat'].includes(ascii(4, 8))) return 'video/iso.segment';
  if (bytes.length >= 8 && ascii(4, 8) === 'moov') return 'video/mp4';
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3)
    return 'video/webm';
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF') {
    if (ascii(8, 12) === 'WEBP') return 'image/webp';
    if (ascii(8, 12) === 'WAVE') return 'audio/wav';
  }
  if (bytes.length >= 4 && ascii(0, 4) === 'OggS') return 'audio/ogg';
  if (bytes.length >= 4 && ascii(0, 4) === 'fLaC') return 'audio/flac';
  if (bytes.length >= 7 && ascii(0, 7) === '#EXTM3U') return 'application/vnd.apple.mpegurl';
  // MPEG-TS has no magic string; it is 188-byte packets each starting with 0x47.
  if (bytes.length > 188 && bytes[0] === 0x47 && bytes[188] === 0x47) return 'video/mp2t';
  if (bytes.length >= 2 && ascii(0, 2) === 'BM') return 'image/bmp';
  return undefined;
}

function imageDimensions(
  bytes: Uint8Array,
  mimeType: string | undefined
): { width: number; height: number } | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mimeType === 'image/png' && bytes.length >= 24) return { width: view.getUint32(16), height: view.getUint32(20) };
  if (mimeType === 'image/gif' && bytes.length >= 10)
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  if (mimeType !== 'image/jpeg') return undefined;
  for (let offset = 2; offset + 9 < bytes.length; ) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const length = view.getUint16(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3)
      return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
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
function normalizeHttpServerUrls(values: Array<string | undefined>): string[] {
  const urls = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol === 'http:' || url.protocol === 'https:') urls.add(normalizeServerUrl(value));
    } catch {
      // Ignore malformed server hints from untrusted events.
    }
  }
  return [...urls];
}
