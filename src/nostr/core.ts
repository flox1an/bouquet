import { EventStore } from 'applesauce-core';
import { RelayPool } from 'applesauce-relay';
import { createEventLoaderForStore } from 'applesauce-loaders/loaders';
import type { Filter, NostrEvent } from 'nostr-tools';
import { openDB, getEventsForFilters, addEvents, type NostrIDBDatabase } from 'nostr-idb';
import { persistEventsToCache } from 'applesauce-core/helpers';
import { NostrConnectSigner } from 'applesauce-signers';
import type { NostrSubscriptionMethod, NostrPublishMethod } from 'applesauce-signers';
import { filter, mergeMap, race, throwError, timer } from 'rxjs';

// Default relays
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://relay.snort.social',
  'wss://nos.lol',
  'wss://nostr.wine',
  'wss://relay.primal.net',
  'wss://purplepag.es/',
];

// IndexedDB cache for local event storage
let cache: NostrIDBDatabase | undefined;

async function ensureCache() {
  if (!cache) {
    cache = await openDB();
  }
  return cache;
}
ensureCache();

export async function cacheRequest(filters: Filter[]) {
  const db = await ensureCache();
  return getEventsForFilters(db, filters);
}

// Initialize EventStore and RelayPool as singletons
export const eventStore = new EventStore();
export const relayPool = new RelayPool();

// Request timeout to prevent hanging relay requests (5 seconds)
const REQUEST_TIMEOUT_MS = 5000;
const originalRequest = relayPool.request.bind(relayPool);

relayPool.request = ((relays, filters, opts) => {
  const timeout$ = timer(REQUEST_TIMEOUT_MS).pipe(
    mergeMap(() =>
      throwError(() => new Error(`Relay request timed out after ${REQUEST_TIMEOUT_MS}ms`))
    )
  );
  return race(originalRequest(relays, filters, opts), timeout$);
}) as typeof relayPool.request;

// Configure unified loader for all event types
createEventLoaderForStore(eventStore, relayPool, {
  cacheRequest,
  lookupRelays: DEFAULT_RELAYS,
  bufferTime: 0,
});

// Save all new events to the cache automatically
persistEventsToCache(eventStore, (events: NostrEvent[]) => addEvents(cache!, events));

// Configure NostrConnectSigner with relay pool methods
export const subscriptionMethod: NostrSubscriptionMethod = (
  relays: string[],
  filters: Filter[]
) => {
  return relayPool
    .subscription(relays, filters)
    .pipe(
      filter(
        (response): response is NostrEvent => typeof response !== 'string' && 'kind' in response
      )
    );
};

export const publishMethod: NostrPublishMethod = async (relays: string[], event: NostrEvent) => {
  const results = await relayPool.publish(relays, event);
  return results;
};

// Set global methods for NostrConnectSigner
NostrConnectSigner.subscriptionMethod = subscriptionMethod;
NostrConnectSigner.publishMethod = publishMethod;

// Connect to relays function
export function connectToRelays(relays: string[] = DEFAULT_RELAYS) {
  for (const url of relays) {
    relayPool.relay(url);
  }
  console.log('Connecting to relays:', relays);
}
