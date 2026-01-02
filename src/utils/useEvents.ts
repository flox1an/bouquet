import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useObservable, useSubscription } from 'observable-hooks';
import { createTimelineLoader, TimelineLoader } from 'applesauce-loaders/loaders';
import type { Filter, NostrEvent } from 'nostr-tools';
import { eventStore, relayPool, cacheRequest, DEFAULT_RELAYS } from '../nostr/core';
import { hashSha256 } from './utils';

export interface SubscriptionOptions {
  disable?: boolean;
  closeOnEose?: boolean;
}

export default function useEvents(
  filter: Filter | Filter[],
  opts?: SubscriptionOptions,
  relays?: string[]
) {
  const [eose, setEose] = useState(false);
  const [events, setEvents] = useState<NostrEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const subscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
  const loaderRef = useRef<TimelineLoader | null>(null);
  const oldestTimestampRef = useRef<number | undefined>(undefined);

  const effectiveRelays = useMemo(
    () => (relays?.length ? relays : DEFAULT_RELAYS),
    [relays]
  );
  const normalizedFilter = useMemo(
    () => (Array.isArray(filter) ? filter[0] : filter),
    [filter]
  );

  const id = useMemo(() => hashSha256(normalizedFilter), [normalizedFilter]);

  // Create and manage loader subscription
  useEffect(() => {
    if (opts?.disable || !normalizedFilter) {
      setEvents([]);
      setEose(false);
      setHasMore(true);
      oldestTimestampRef.current = undefined;
      return;
    }

    // Reset state for new subscription
    setEose(false);
    setHasMore(true);
    oldestTimestampRef.current = undefined;

    // Clean up previous subscription
    subscriptionRef.current?.unsubscribe();

    const loader = createTimelineLoader(relayPool, effectiveRelays, normalizedFilter, {
      eventStore,
      cache: cacheRequest,
      limit: 100,
    });
    loaderRef.current = loader;

    const sub = loader().subscribe({
      complete: () => setEose(true),
      error: err => console.error('Timeline loader error:', err),
    });

    subscriptionRef.current = sub;

    return () => {
      sub.unsubscribe();
      subscriptionRef.current = null;
      loaderRef.current = null;
    };
  }, [id, opts?.disable]);

  // Create observable for timeline from event store
  const timeline$ = useObservable(
    () => eventStore.timeline(normalizedFilter),
    [normalizedFilter]
  );

  // Subscribe to timeline updates
  useSubscription(timeline$, {
    next: (timelineEvents: NostrEvent[]) => {
      if (!opts?.disable) {
        setEvents(timelineEvents);
        // Track the oldest timestamp for pagination
        if (timelineEvents.length > 0) {
          const oldest = Math.min(...timelineEvents.map(e => e.created_at));
          oldestTimestampRef.current = oldest;
        }
      }
    },
  });

  // Load more (older) events
  const loadMore = useCallback(() => {
    if (!loaderRef.current || loading || !hasMore || !oldestTimestampRef.current) {
      return;
    }

    setLoading(true);
    const currentEventCount = events.length;

    const sub = loaderRef.current({ until: oldestTimestampRef.current - 1 }).subscribe({
      complete: () => {
        setLoading(false);
        setTimeout(() => {
          if (events.length === currentEventCount) {
            setHasMore(false);
          }
        }, 500);
      },
      error: err => {
        console.error('Load more error:', err);
        setLoading(false);
      },
    });

    return () => sub.unsubscribe();
  }, [loading, hasMore, events.length]);

  return { id, eose, events, loadMore, loading, hasMore };
}
