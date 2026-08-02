import type { BlobDescriptor } from 'blossom-client-sdk';
import type { NostrEvent } from 'nostr-tools';
import { extractEventReferences, EVENT_EXTRACTOR_VERSION, type EventReference } from './eventReferences';

const DATABASE_NAME = 'bouquet-user-blob-catalog';
const DATABASE_VERSION = 3;
const HASH_PATTERN = /^[a-f0-9]{64}$/;

export type CatalogServerType = 'blossom' | 'nip96';
export type EvidenceType = 'server-list' | 'authored-event' | 'event-reference' | 'upload' | 'mirror' | 'manual' | 'manifest-child';
export type ServerListState = 'pending' | 'complete' | 'failed' | 'unsupported';

type ProfileRecord = { pubkey: string; createdAt: number; lastSyncAt?: number; catalogVersion: number };
type ServerRecord = { serverId: string; baseUrl: string; serverType: CatalogServerType; capabilities: string[]; lastCapabilityCheckAt?: number };
type ProfileServerRecord = { id: string; pubkey: string; serverId: string; source: 'configuration'; enabled: boolean; firstSeenAt: number; lastSeenAt: number };
type BlobRecord = { sha256: string; verifiedSize?: number; verifiedMimeType?: string; firstSeenAt: number; lastEnrichedAt?: number };
type MembershipRecord = { id: string; pubkey: string; sha256: string; firstSeenAt: number; lastSeenAt: number; status: 'active' | 'unresolved' | 'forgotten' };
type EvidenceRecord = { evidenceId: string; pubkey: string; sha256: string; evidenceType: EvidenceType; sourceId: string; relationRole: string; discoveredAt: number; depth: number };
type ServerListRunRecord = { id: string; pubkey: string; serverId: string; cursor?: string; state: ServerListState; startedAt: number; completedAt?: number; error?: string; received: number };
type CatalogEventRecord = { eventId: string; event: NostrEvent; pubkey: string; kind: number; createdAt: number; firstSeenAt: number; lastSeenAt: number; extractorVersion: number; extractedAt?: number };
type ProfileEventRecord = { id: string; pubkey: string; eventId: string; firstSeenAt: number; lastSeenAt: number };
type EventRelayRecord = { id: string; pubkey: string; eventId: string; relayUrl: string; firstSeenAt: number; lastSeenAt: number };
type EventReferenceRecord = { id: string; pubkey: string; eventId: string; sha256?: string; url?: string; role: string; isDirect: boolean; extractedAt: number; extractorVersion: number };
type EventSyncRunRecord = { id: string; pubkey: string; relayUrl: string; cursor?: number; state: 'pending' | 'complete' | 'failed'; startedAt: number; completedAt?: number; error?: string; received: number };

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
  | 'event_sync_run';

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
      if (record) await this.persistEvent(pubkey, record.event, undefined, now);
    }
    this.changed();
  }

  async getCatalogStatus(pubkey: string): Promise<CatalogStatus> {
    const [memberships, evidence, runs, relayRuns, profile] = await Promise.all([
      this.store.getAll<MembershipRecord>('profile_blob_membership'),
      this.store.getAll<EvidenceRecord>('profile_blob_evidence'),
      this.store.getAll<ServerListRunRecord>('server_list_run'),
      this.store.getAll<EventSyncRunRecord>('event_sync_run'),
      this.store.get<ProfileRecord>('profile', pubkey),
    ]);
    const profileEvidence = evidence.filter(item => item.pubkey === pubkey);
    return {
      knownHashes: memberships.filter(item => item.pubkey === pubkey && item.status === 'active').length,
      directSeeds: profileEvidence.filter(item => item.depth === 0).length,
      derivedSeeds: profileEvidence.filter(item => item.depth > 0).length,
      serverLists: runs.filter(item => item.pubkey === pubkey).map(({ serverId, state, cursor, error, received }) => ({ serverId, state, cursor, error, received })),
      relaySyncs: relayRuns.filter(item => item.pubkey === pubkey).map(({ relayUrl, state, cursor, error, received }) => ({ relayUrl, state, cursor, error, received })),
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

  private async persistEvent(pubkey: string, event: NostrEvent, relayUrl: string | undefined, now: number) {
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
    await this.store.put<ProfileEventRecord>('profile_event', { id: profileEventId, pubkey, eventId: event.id, firstSeenAt: profileEvent?.firstSeenAt ?? now, lastSeenAt: now });
    if (relayUrl) {
      const relayId = `${pubkey}:${event.id}:${relayUrl}`;
      const relay = await this.store.get<EventRelayRecord>('event_relay_observation', relayId);
      await this.store.put<EventRelayRecord>('event_relay_observation', { id: relayId, pubkey, eventId: event.id, relayUrl, firstSeenAt: relay?.firstSeenAt ?? now, lastSeenAt: now });
    }
    const references = extractEventReferences(event);
    for (const [index, reference] of references.entries()) {
      await this.persistEventReference(pubkey, event.id, reference, index, now);
      if (reference.sha256) {
        await this.ingestBlob(pubkey, descriptorFromReference(reference), {
          evidenceType: reference.isDirect ? 'authored-event' : 'event-reference',
          sourceId: event.id,
          relationRole: reference.role,
          depth: reference.isDirect ? 0 : 1,
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
