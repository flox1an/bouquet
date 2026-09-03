/// <reference lib="webworker" />
import { Catalog, IndexedDbCatalogStore } from './catalog';
import {
  getAssetReplicaMap,
  getCatalogAssetContents,
  getCatalogTimelineAsset,
  planCatalogAction,
  projectCatalogAssets,
  queryCatalogAssetIds,
  queryCatalogTimeline,
  refreshEventUrlAvailability,
  refreshReplicaAvailability,
} from './advanced';

/**
 * Runs the whole catalog on a worker thread so ingest, projection, and query
 * work never blocks the UI. Function-valued arguments (relays loaders, probes)
 * cannot cross the boundary; the client marks them and this host substitutes a
 * stub that asks the main thread to run the real function.
 */
const catalog = new Catalog(new IndexedDbCatalogStore());
catalog.onChanged = pubkey => {
  self.postMessage({ event: 'changed', pubkey });
};

/**
 * One typed boundary between the wire (unknown[] args) and the real signatures.
 * Inside this file everything downstream of `route` stays fully typed.
 */
function route<A extends unknown[]>(fn: (...args: A) => unknown): (...args: unknown[]) => unknown {
  return (...args: unknown[]) => fn(...(args as A));
}

const implementations: Record<string, (...args: unknown[]) => unknown> = {
  ingestServerList: route(catalog.ingestServerList.bind(catalog)),
  ingestUpload: route(catalog.ingestUpload.bind(catalog)),
  listAdditionalPubkeys: route(catalog.listAdditionalPubkeys.bind(catalog)),
  addAdditionalPubkey: route(catalog.addAdditionalPubkey.bind(catalog)),
  removeAdditionalPubkey: route(catalog.removeAdditionalPubkey.bind(catalog)),
  recordBlobsRemoved: route(catalog.recordBlobsRemoved.bind(catalog)),
  ingestAuthoredEvents: route(catalog.ingestAuthoredEvents.bind(catalog)),
  syncAuthoredEvents: route(catalog.syncAuthoredEvents.bind(catalog)),
  syncReverseLookups: route(catalog.syncReverseLookups.bind(catalog)),
  syncAdditionalEvents: route(catalog.syncAdditionalEvents.bind(catalog)),
  reprojectEvents: route(catalog.reprojectEvents.bind(catalog)),
  enrichHls: route(catalog.enrichHls.bind(catalog)),
  enrichBlobPrefix: route(catalog.enrichBlobPrefix.bind(catalog)),
  ingestId3: route(catalog.ingestId3.bind(catalog)),
  queryPlaylistHashes: route(catalog.queryPlaylistHashes.bind(catalog)),
  reset: route(catalog.reset.bind(catalog)),
  queryUnidentifiedBlobs: route(catalog.queryUnidentifiedBlobs.bind(catalog)),
  getCatalogStatus: route(catalog.getCatalogStatus.bind(catalog)),
  markProjectionComplete: route(catalog.markProjectionComplete.bind(catalog)),
  updateBlobServerMetadata: route(catalog.updateBlobServerMetadata.bind(catalog)),
  isProjectionStale: route(catalog.isProjectionStale.bind(catalog)),
  projectCatalogAssets: route(projectCatalogAssets.bind(null, catalog)),
  queryCatalogTimeline: route(queryCatalogTimeline.bind(null, catalog)),
  queryCatalogAssetIds: route(queryCatalogAssetIds.bind(null, catalog)),
  getCatalogTimelineAsset: route(getCatalogTimelineAsset.bind(null, catalog)),
  getCatalogAssetContents: route(getCatalogAssetContents.bind(null, catalog)),
  planCatalogAction: route(planCatalogAction.bind(null, catalog)),
  getAssetReplicaMap: route(getAssetReplicaMap.bind(null, catalog)),
  refreshReplicaAvailability: route(refreshReplicaAvailability.bind(null, catalog)),
  refreshEventUrlAvailability: route(refreshEventUrlAvailability.bind(null, catalog)),
};

self.onmessage = async (event: MessageEvent) => {
  const { id, method, args } = event.data as { id: number; method: string; args: unknown[] };
  try {
    const implementation = implementations[method];
    if (!implementation) throw new Error(`Unknown catalog method ${method}`);
    const result = await implementation(...hydrateLoaders(id, args));
    self.postMessage({ id, result });
  } catch (error) {
    // Include the worker-side stack: the client can only see the message, so
    // the stack is the only way to locate a failure inside this file.
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
};

type BridgedLoader = { __bridge: number };

function hydrateLoaders(callId: number, args: unknown[]): unknown[] {
  return args.map(arg => {
    if (arg && typeof arg === 'object' && '__bridge' in (arg as BridgedLoader)) {
      const bridgeId = (arg as BridgedLoader).__bridge;
      return async (...loaderArgs: unknown[]) => {
        const { promise, resolve, reject } = Promise.withResolvers<unknown>();
        const onMessage = (event: MessageEvent) => {
          if (event.data?.bridgeId !== bridgeId) return;
          self.removeEventListener('message', onMessage);
          if ('error' in event.data) reject(new Error(event.data.error));
          else resolve(event.data.result);
        };
        self.addEventListener('message', onMessage);
        self.postMessage({ event: 'bridge', callId, bridgeId, args: loaderArgs });
        return promise;
      };
    }
    return arg;
  });
}
