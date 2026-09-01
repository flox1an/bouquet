import { firstValueFrom, toArray } from 'rxjs';
import type { Filter } from 'nostr-tools';
import { mergeRelays, relayPool } from '../nostr/core';
import type { Catalog } from './catalog';

export const CATALOG_EVENT_KINDS = [1, 20, 21, 22, 1063, 5128, 15128, 30563, 31337, 34235, 34236, 35128] as const;

/**
 * Both the in-thread catalog and the worker client expose these two methods with the
 * same shape, and the relay loaders have to run on this thread either way - the
 * client bridges them back out of the worker.
 */
type EventSyncTarget = Pick<Catalog, 'syncAuthoredEvents' | 'syncReverseLookups'>;

export async function syncAuthoredEventsFromRelays(catalog: EventSyncTarget, pubkey: string, relayUrls: string[]) {
  for (const relayUrl of mergeRelays(relayUrls)) {
    try {
      await catalog.syncAuthoredEvents(pubkey, relayUrl, async ({ until, limit }) => {
        const filter: Filter = { authors: [pubkey], kinds: [...CATALOG_EVENT_KINDS], limit, until };
        return firstValueFrom(relayPool.request([relayUrl], [filter]).pipe(toArray()));
      });
    } catch {
      // The catalog records the per-relay error and continues with the remaining relays.
    }
  }
}

export async function syncReverseLookupsFromRelays(catalog: EventSyncTarget, pubkey: string, relayUrls: string[]) {
  for (const relayUrl of mergeRelays(relayUrls)) {
    try {
      await catalog.syncReverseLookups(pubkey, relayUrl, async hashes => {
        const filter: Filter = { '#x': hashes, kinds: [...CATALOG_EVENT_KINDS], limit: 500 };
        return firstValueFrom(relayPool.request([relayUrl], [filter]).pipe(toArray()));
      });
    } catch {
      // The catalog records the per-relay error and continues with the remaining relays.
    }
  }
}
