import { useEffect, useMemo, useRef } from 'react';
import { use$ } from 'applesauce-react/hooks';
import { createTimelineLoader } from 'applesauce-loaders/loaders';
import type { Filter, NostrEvent } from 'nostr-tools';
import { map } from 'rxjs/operators';
import { eventStore, relayPool, cacheRequest, DEFAULT_RELAYS } from '../nostr/core';
import { hashSha256 } from './utils';
import { SubscriptionOptions } from './useEvents';

export default function useEvent(
  filter: Filter,
  opts?: SubscriptionOptions,
  relays?: string[]
): { data: NostrEvent | undefined; isLoading: boolean; isSuccess: boolean } {
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

  const effectiveRelays = relays?.length ? relays : DEFAULT_RELAYS;

  const id = useMemo(() => hashSha256(filter), [filter]);

  // Create and manage loader subscription
  useEffect(() => {
    if (opts?.disable || !filter) {
      return;
    }

    // Clean up previous subscription
    subscriptionRef.current?.unsubscribe();

    const loader = createTimelineLoader(relayPool, effectiveRelays, filter, {
      eventStore,
      cache: cacheRequest,
      limit: 1,
    });

    const sub = loader().subscribe({
      error: err => console.error('Event loader error:', err),
    });

    subscriptionRef.current = sub;

    return () => {
      sub.unsubscribe();
      subscriptionRef.current = null;
    };
  }, [id, opts?.disable]);

  // Subscribe to timeline from event store and return first event
  const event = use$(
    () =>
      eventStore.timeline(filter).pipe(
        map((events: NostrEvent[]) => (events.length > 0 ? events[0] : undefined))
      ),
    [filter]
  );

  return {
    data: event,
    isLoading: !opts?.disable && event === undefined,
    isSuccess: event !== undefined,
  };
}
