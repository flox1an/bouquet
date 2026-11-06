import { EventStore } from 'applesauce-core';
import { RelayPool } from 'applesauce-relay';
import { createEventLoaderForStore } from 'applesauce-loaders/loaders';
import type { Filter, NostrEvent } from 'nostr-tools';
import { openDB, getEventsForFilters, addEvents, type NostrIDBDatabase } from 'nostr-idb';
import { persistEventsToCache } from 'applesauce-core/helpers';
import { NostrConnectSigner } from 'applesauce-signers';
import type { NostrSubscriptionMethod, NostrPublishMethod } from 'applesauce-signers';
import { filter, takeUntil, timeout, timer } from 'rxjs';
import { normalizeURL } from 'applesauce-core/helpers/url';

// Default relays. VITE_RELAYS points the whole app at a local relay instead,
// which is what the integration stack in test/e2e relies on.
const configuredRelays = import.meta.env.VITE_RELAYS?.split(',')
  .map(relay => relay.trim())
  .filter(Boolean);

export const DEFAULT_RELAYS = configuredRelays?.length
  ? configuredRelays
  : [
      'wss://relay.nostr.band',
      'wss://relay.snort.social',
      'wss://nos.lol',
      'wss://nostr.wine',
      'wss://relay.primal.net',
      'wss://purplepag.es/',
      'wss://relay.nostu.be',
    ];

/** Canonical relay URL (same rules the pool uses), or undefined for garbage input. */
export function normalizeRelay(url: string): string | undefined {
  try {
    const parsed = new URL(url.trim());
    if (!['ws:', 'wss:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) return undefined;
    return normalizeURL(parsed.toString());
  } catch {
    return undefined;
  }
}

const uniqueRelays = (urls: string[]) => [
  ...new Set(urls.map(normalizeRelay).filter((url): url is string => !!url)),
];

/** Where to look for events: the user's relays first, then the defaults. */
export function mergeRelays(userRelays: string[] = []): string[] {
  return uniqueRelays([...userRelays, ...DEFAULT_RELAYS]);
}

/** Where to publish the user's own events: only their NIP-65 write relays.
    Defaults are a fallback for users without a relay list, never an addition. */
export function writeRelays(userRelays?: string[]): string[] {
  return uniqueRelays(userRelays ?? DEFAULT_RELAYS);
}

// IndexedDB cache for local event storage
let cache: NostrIDBDatabase | undefined;

async function ensureCache() {
  if (!cache) {
    cache = await openDB();
  }
  return cache;
}
ensureCache();

export async function cacheRequest(filters: Filter[]): Promise<NostrEvent[]> {
  const db = await ensureCache();
  return getEventsForFilters(db, filters);
}

// Initialize EventStore and RelayPool as singletons
export const eventStore = new EventStore();
export const relayPool = new RelayPool();

// Reads across several relays end at the deadline with whatever already arrived:
// one slow relay must not discard the answers of the fast ones.
const REQUEST_TIMEOUT_MS = 5000;
const originalRequest = relayPool.request.bind(relayPool);

relayPool.request = ((relays, filters, opts) =>
  originalRequest(relays, filters, opts).pipe(takeUntil(timer(REQUEST_TIMEOUT_MS)))) as typeof relayPool.request;

/** All-or-error read for paginated catalog sync: a page cut off by a deadline must
    fail (the catalog keeps its cursor and resumes) instead of looking like the last page.
    Errors only when the relay goes silent, so long pages still stream through. */
export function requestComplete(relayUrl: string, filters: Filter[]) {
  return relayPool.relay(relayUrl).request(filters).pipe(timeout({ first: REQUEST_TIMEOUT_MS, each: REQUEST_TIMEOUT_MS }));
}

// Configure unified loader for all event types
createEventLoaderForStore(eventStore, relayPool, {
  cacheRequest,
  lookupRelays: DEFAULT_RELAYS,
  bufferTime: 0,
});

// Save all new events to the cache automatically
persistEventsToCache(eventStore, (events: NostrEvent[]) => addEvents(cache!, events));

// Configure NostrConnectSigner with relay pool methods
export const subscriptionMethod: NostrSubscriptionMethod = (relays: string[], filters: Filter[]) => {
  return relayPool
    .subscription(relays, filters)
    .pipe(filter((response): response is NostrEvent => typeof response !== 'string' && 'kind' in response));
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
}
