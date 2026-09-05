/// <reference lib="webworker" />
import { Catalog, IndexedDbCatalogStore } from './catalog';
import { catalogMethodNames } from './catalogClient';

type WorkerPort = {
  postMessage(message: unknown): void;
  onmessage?: ((event: MessageEvent) => void) | null;
  addEventListener(type: string, listener: (event: MessageEvent) => void): void;
  removeEventListener(type: string, listener: (event: MessageEvent) => void): void;
};

type BridgedLoader = { __bridge: number };

function route<A extends unknown[]>(fn: (...args: A) => unknown): (...args: unknown[]) => unknown {
  return (...args: unknown[]) => fn(...(args as A));
}

export function createCatalogWorkerHost(port: WorkerPort, catalog: Catalog) {
  catalog.onChanged = pubkey => {
    port.postMessage({ event: 'changed', pubkey });
  };
  const implementations = Object.fromEntries(
    catalogMethodNames.map(method => [
      method,
      route((...args: unknown[]) => (catalog[method] as (...values: unknown[]) => unknown).apply(catalog, args)),
    ])
  ) as Record<string, (...args: unknown[]) => unknown>;
  const hydrateLoaders = (callId: number, args: unknown[]) =>
    args.map(arg => {
      if (!arg || typeof arg !== 'object' || !('__bridge' in (arg as BridgedLoader))) return arg;
      const bridgeId = (arg as BridgedLoader).__bridge;
      return async (...loaderArgs: unknown[]) => {
        const { promise, resolve, reject } = Promise.withResolvers<unknown>();
        const onMessage = (event: MessageEvent) => {
          if (event.data?.bridgeId !== bridgeId) return;
          port.removeEventListener('message', onMessage);
          if ('error' in event.data) reject(new Error(event.data.error));
          else resolve(event.data.result);
        };
        port.addEventListener('message', onMessage);
        port.postMessage({ event: 'bridge', callId, bridgeId, args: loaderArgs });
        return promise;
      };
    });
  port.onmessage = async event => {
    const { id, method, args } = event.data as { id: number; method: string; args: unknown[] };
    try {
      const implementation = implementations[method];
      if (!implementation) throw new Error(`Unknown catalog method ${method}`);
      port.postMessage({ id, result: await implementation(...hydrateLoaders(id, args)) });
    } catch (error) {
      port.postMessage({
        id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  };
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope)
  createCatalogWorkerHost(self as unknown as WorkerPort, new Catalog(new IndexedDbCatalogStore()));
