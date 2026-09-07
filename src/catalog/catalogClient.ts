import type {
  AdditionalPubkey,
  BlobRemoval,
  CatalogServerType,
  EventPageLoader,
  CatalogStatus,
  HlsExpansionLimits,
  HlsPlaylistLoader,
  ReverseLookupBatchLoader,
  ServerListInput,
} from './catalog';
import type {
  AssetReplica,
  CatalogAction,
  NativeUrlProbe,
  ReplicaProbe,
  ReplicaState,
  TimelineAssetContents,
  TimelineAssetDetail,
  TimelineProjection,
  TimelineQuery,
} from './advanced';
import { Catalog, MemoryCatalogStore } from './catalog';

/**
 * Main-thread handle for the catalog. Every call executes in a worker thread
 * (`catalogWorker.ts`); function-valued arguments (relay loaders, availability
 * probes) are transparently bridged back to this thread, so callers keep
 * passing ordinary functions. Change notifications arrive as the same
 * `bouquet-catalog-changed` window event the in-thread catalog used to fire.
 */

type WorkerMessage = {
  id?: number;
  event?: string;
  error?: string;
  stack?: string;
  result?: unknown;
  bridgeId?: number;
  args?: unknown[];
};
type WorkerPort = {
  postMessage(message: unknown): void;
  onmessage?: ((event: MessageEvent) => void) | null;
  onerror?: Worker['onerror'];
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  removeEventListener(type: string, listener: (event: MessageEvent) => void): void;
};
export const catalogMethodNames = [
  'ingestServerList', 'reset', 'listAdditionalPubkeys', 'addAdditionalPubkey', 'removeAdditionalPubkey',
  'ingestUpload', 'recordBlobsRemoved', 'ingestAuthoredEvents', 'syncAuthoredEvents', 'syncAdditionalEvents', 'syncReverseLookups',
  'enrichHls', 'enrichBlobPrefix', 'queryPlaylistHashes', 'queryUnidentifiedBlobs', 'ingestId3',
  'getCatalogStatus', 'updateBlobServerMetadata', 'queryCatalogTimeline', 'queryCatalogAssetIds',
  'getCatalogTimelineAsset', 'getCatalogAssetContents', 'planCatalogAction', 'getAssetReplicaMap',
  'refreshReplicaAvailability', 'refreshEventUrlAvailability',
] as const satisfies readonly (keyof Catalog)[];
type CatalogMethodName = (typeof catalogMethodNames)[number];

type ServerRef = { url: string; type: CatalogServerType };

export class CatalogClient {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private readonly bridges = new Map<number, (...args: unknown[]) => unknown>();
  private readonly worker: WorkerPort | undefined;

  constructor(port?: WorkerPort) {
    if (port) {
      this.worker = port;
    } else if (typeof Worker !== 'undefined' && import.meta.env?.MODE !== 'test') {
      this.worker = new Worker(new URL('./catalogWorker.ts', import.meta.url), { type: 'module' });
    }
    if (!this.worker) return;
    this.worker.onmessage = event => this.receive(event.data as WorkerMessage);
    this.worker.onerror = event => {
      const error = new Error(event.message || 'Catalog worker failed');
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    };
  }

  private receive(message: WorkerMessage) {
    if (message.event === 'changed') {
      window.dispatchEvent(new Event('bouquet-catalog-changed'));
      return;
    }
    if (message.event === 'bridge') {
      const bridge = this.bridges.get(message.bridgeId!);
      if (!bridge) return;
      Promise.resolve()
        .then(() => bridge(...(message.args ?? [])))
        .then(
          result => this.worker!.postMessage({ bridgeId: message.bridgeId, result }),
          error =>
            this.worker!.postMessage({
              bridgeId: message.bridgeId,
              error: error instanceof Error ? error.message : String(error),
            })
        );
      return;
    }
    const pending = this.pending.get(message.id!);
    if (!pending) return;
    this.pending.delete(message.id!);
    if (message.error) {
      const error = new Error(message.error);
      if (message.stack) error.stack = `${error.stack}\nWorker stack: ${message.stack}`;
      pending.reject(error);
    } else pending.resolve(message.result);
  }

  private call(method: CatalogMethodName, ...args: unknown[]): Promise<unknown> {
    if (!this.worker) return Promise.reject(new Error('Catalog worker is unavailable'));
    const id = this.nextId++;
    const { promise, resolve, reject } = Promise.withResolvers<unknown>();
    this.pending.set(id, { resolve, reject });
    const prepared = args.map(arg => {
      if (typeof arg !== 'function') return arg;
      const bridgeId = this.nextId++;
      this.bridges.set(bridgeId, arg as (...bridgeArgs: unknown[]) => unknown);
      return { __bridge: bridgeId };
    });
    this.worker.postMessage({ id, method, args: prepared });
    return promise;
  }

  ingestServerList(pubkey: string, input: ServerListInput): Promise<void> {
    return this.call('ingestServerList', pubkey, input) as Promise<void>;
  }
  /** Wipes every catalog record. Resolves once the wipe is durable, then announces
      the change so open views re-query an empty catalog while the rescan refetches. */
  async reset(): Promise<void> {
    await this.call('reset');
    window.dispatchEvent(new Event('bouquet-catalog-changed'));
  }
  listAdditionalPubkeys(ownerPubkey: string): Promise<AdditionalPubkey[]> {
    return this.call('listAdditionalPubkeys', ownerPubkey) as Promise<AdditionalPubkey[]>;
  }
  addAdditionalPubkey(ownerPubkey: string, source: Omit<AdditionalPubkey, 'addedAt'>): Promise<void> {
    return this.call('addAdditionalPubkey', ownerPubkey, source) as Promise<void>;
  }
  removeAdditionalPubkey(ownerPubkey: string, pubkey: string): Promise<void> {
    return this.call('removeAdditionalPubkey', ownerPubkey, pubkey) as Promise<void>;
  }
  ingestUpload(
    pubkey: string,
    server: ServerRef,
    descriptor: Parameters<Catalog['ingestUpload']>[2],
    mirrored?: boolean
  ): Promise<void> {
    return this.call('ingestUpload', pubkey, server, descriptor, mirrored) as Promise<void>;
  }
  recordBlobsRemoved(pubkey: string, removals: BlobRemoval[]): Promise<void> {
    return this.call('recordBlobsRemoved', pubkey, removals) as Promise<void>;
  }
  ingestAuthoredEvents(
    pubkey: string,
    events: Parameters<Catalog['ingestAuthoredEvents']>[1],
    relayUrl: string
  ): Promise<void> {
    return this.call('ingestAuthoredEvents', pubkey, events, relayUrl) as Promise<void>;
  }
  syncAuthoredEvents(pubkey: string, relayUrl: string, loadPage: EventPageLoader, limit?: number): Promise<void> {
    return this.call('syncAuthoredEvents', pubkey, relayUrl, loadPage, limit) as Promise<void>;
  }
  syncAdditionalEvents(
    ownerPubkey: string,
    sourcePubkey: string,
    relayUrl: string,
    loadPage: EventPageLoader,
    serverUrls?: string[],
    limit?: number
  ): Promise<void> {
    return this.call(
      'syncAdditionalEvents',
      ownerPubkey,
      sourcePubkey,
      relayUrl,
      loadPage,
      serverUrls,
      limit
    ) as Promise<void>;
  }
  syncReverseLookups(
    pubkey: string,
    relayUrl: string,
    loadBatch: ReverseLookupBatchLoader,
    batchSize?: number,
    maxHashes?: number
  ): Promise<void> {
    return this.call('syncReverseLookups', pubkey, relayUrl, loadBatch, batchSize, maxHashes) as Promise<void>;
  }
  enrichHls(
    pubkey: string,
    rootSha256: string,
    loadPlaylist: HlsPlaylistLoader,
    limits?: HlsExpansionLimits
  ): Promise<void> {
    return this.call('enrichHls', pubkey, rootSha256, loadPlaylist, limits) as Promise<void>;
  }
  enrichBlobPrefix(
    pubkey: string,
    sha256: string,
    url: string,
    loadPrefix: Parameters<Catalog['enrichBlobPrefix']>[3],
    maxBytes?: number,
    notify?: boolean
  ): Promise<string | undefined> {
    return this.call('enrichBlobPrefix', pubkey, sha256, url, loadPrefix, maxBytes, notify) as Promise<
      string | undefined
    >;
  }
  queryPlaylistHashes(): Promise<string[]> {
    return this.call('queryPlaylistHashes') as Promise<string[]>;
  }
  queryUnidentifiedBlobs(
    pubkey: string,
    maxSize?: number,
    limit?: number
  ): Promise<Array<{ sha256: string; url: string }>> {
    return this.call('queryUnidentifiedBlobs', pubkey, maxSize, limit) as Promise<
      Array<{ sha256: string; url: string }>
    >;
  }
  ingestId3(sha256: string, tags: Parameters<Catalog['ingestId3']>[1]): Promise<void> {
    return this.call('ingestId3', sha256, tags) as Promise<void>;
  }
  getCatalogStatus(pubkey: string): Promise<CatalogStatus | undefined> {
    return this.call('getCatalogStatus', pubkey) as Promise<CatalogStatus | undefined>;
  }
  updateBlobServerMetadata(sha256: string, size?: number, mimeType?: string): Promise<void> {
    return this.call('updateBlobServerMetadata', sha256, size, mimeType) as Promise<void>;
  }
  queryCatalogTimeline(pubkey: string, query?: TimelineQuery): Promise<TimelineProjection[]> {
    return this.call('queryCatalogTimeline', pubkey, query) as Promise<TimelineProjection[]>;
  }
  queryCatalogAssetIds(query: { serverId?: string; hashTerms?: string[] }): Promise<string[]> {
    return this.call('queryCatalogAssetIds', query) as Promise<string[]>;
  }
  getCatalogTimelineAsset(pubkey: string, assetId: string): Promise<TimelineAssetDetail | undefined> {
    return this.call('getCatalogTimelineAsset', pubkey, assetId) as Promise<TimelineAssetDetail | undefined>;
  }
  getCatalogAssetContents(assetId: string, limit: number): Promise<TimelineAssetContents> {
    return this.call('getCatalogAssetContents', assetId, limit) as Promise<TimelineAssetContents>;
  }
  planCatalogAction(
    pubkey: string,
    assetId: string,
    action: CatalogAction
  ): Promise<{ allowed: boolean; reason: string; targets: string[] }> {
    return this.call('planCatalogAction', pubkey, assetId, action) as Promise<{
      allowed: boolean;
      reason: string;
      targets: string[];
    }>;
  }
  getAssetReplicaMap(pubkey: string, assetId: string): Promise<AssetReplica[]> {
    return this.call('getAssetReplicaMap', pubkey, assetId) as Promise<AssetReplica[]>;
  }
  refreshReplicaAvailability(
    pubkey: string,
    probe: ReplicaProbe,
    maxChecks?: number,
    hashes?: string[],
    onCheck?: (sha256: string, serverId: string, state: ReplicaState, httpStatus?: number) => void
  ): Promise<void> {
    return this.call('refreshReplicaAvailability', pubkey, probe, maxChecks, hashes, onCheck) as Promise<void>;
  }
  refreshEventUrlAvailability(
    pubkey: string,
    probe: NativeUrlProbe,
    maxChecks?: number,
    hashes?: string[]
  ): Promise<void> {
    return this.call('refreshEventUrlAvailability', pubkey, probe, maxChecks, hashes) as Promise<void>;
  }
}

let client: CatalogClient | undefined;
export function getCatalogClient(): CatalogClient {
  if (!client) client = new CatalogClient();
  return client;
}

// Re-exported so the legacy in-thread path stays reachable for non-UI code.
export { Catalog, MemoryCatalogStore };
