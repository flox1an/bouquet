import { firstValueFrom, toArray } from 'rxjs';
import type { Filter } from 'nostr-tools';
import { mergeRelays, relayPool } from '../nostr/core';
import { Catalog } from './catalog';

export const CATALOG_EVENT_KINDS = [1, 20, 21, 22, 1063, 30563, 31337, 34235, 34236] as const;

export async function syncAuthoredEventsFromRelays(catalog: Catalog, pubkey: string, relayUrls: string[]) {
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
