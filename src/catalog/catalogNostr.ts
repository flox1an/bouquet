import { firstValueFrom, toArray } from 'rxjs';
import type { Filter, NostrEvent } from 'nostr-tools';
import { mergeRelays, relayPool } from '../nostr/core';
import type { AdditionalPubkey, Catalog } from './catalog';

export const CATALOG_EVENT_KINDS = [
  1, 20, 21, 22, 1063, 5128, 15128, 30563, 31337, 34128, 34235, 34236, 35128,
] as const;

/**
 * Both the in-thread catalog and the worker client expose these two methods with the
 * same shape, and the relay loaders have to run on this thread either way - the
 * client bridges them back out of the worker.
 */
type EventSyncTarget = Pick<Catalog, 'syncAuthoredEvents' | 'syncAdditionalEvents' | 'syncReverseLookups'>;

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

export async function syncAdditionalPubkeyFromRelays(
  catalog: EventSyncTarget,
  ownerPubkey: string,
  source: Pick<AdditionalPubkey, 'pubkey' | 'relayHints'>,
  ownerRelayUrls: string[]
): Promise<void> {
  const seedRelays = mergeRelays([...source.relayHints, ...ownerRelayUrls]);
  const seedMetadata = await loadSourceMetadata(source.pubkey, seedRelays);
  const relayList = newestOfKind(seedMetadata, 10002);
  const sourceRelays = mergeRelays([
    ...source.relayHints,
    ...(relayList?.tags
      .filter(tag => tag[0] === 'r')
      .map(tag => tag[1])
      .filter(Boolean) ?? []),
    ...ownerRelayUrls,
  ]);
  const metadata = [...seedMetadata, ...(await loadSourceMetadata(source.pubkey, sourceRelays))];
  const serverUrls =
    newestOfKind(metadata, 10063)
      ?.tags.filter(tag => tag[0] === 'server')
      .map(tag => tag[1])
      .filter(Boolean) ?? [];

  for (const relayUrl of sourceRelays) {
    try {
      await catalog.syncAdditionalEvents(
        ownerPubkey,
        source.pubkey,
        relayUrl,
        async ({ until, limit }) => {
          const filter: Filter = {
            authors: [source.pubkey],
            kinds: [...CATALOG_EVENT_KINDS],
            limit,
            until,
          };
          return firstValueFrom(relayPool.request([relayUrl], [filter]).pipe(toArray()));
        },
        serverUrls
      );
    } catch {
      // One unavailable relay must not block the remaining source relays.
    }
  }
}

async function loadSourceMetadata(pubkey: string, relayUrls: string[]) {
  try {
    const filter: Filter = { authors: [pubkey], kinds: [10002, 10063], limit: 10 };
    return await firstValueFrom(relayPool.request(relayUrls, [filter]).pipe(toArray()));
  } catch {
    return [];
  }
}
function newestOfKind(events: NostrEvent[], kind: number) {
  return events
    .filter(event => event.kind === kind)
    .sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))[0];
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
