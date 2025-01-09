import {
  NDKEvent,
  NDKFilter,
  NDKRelaySet,
  NDKSubscriptionCacheUsage,
  NDKSubscriptionOptions,
} from '@nostr-dev-kit/ndk';
import { useNDK } from './ndk';
import { useMemo } from 'react';
import { UseQueryResult, useQuery } from '@tanstack/react-query';
import { hashSha256 } from './utils';

export interface SubscriptionOptions extends NDKSubscriptionOptions {
  disable?: boolean;
}

export default function useEvent(filter: NDKFilter, opts?: SubscriptionOptions, relays?: string[]) {
  const { ndk } = useNDK();
  const id = useMemo(() => {
    return hashSha256(filter);
  }, [filter]);

  const query: UseQueryResult<NDKEvent, any> = useQuery({
    queryKey: ['use-event', id],
    queryFn: () => {
      const relaySet = (relays?.length ?? 0 > 0) ? NDKRelaySet.fromRelayUrls(relays as string[], ndk) : undefined;
      return ndk.fetchEvent(
        filter,
        {
          groupable: true,
          cacheUsage: NDKSubscriptionCacheUsage.ONLY_RELAY,
          ...(opts ? opts : {}),
        },
        relaySet
      );
    },
    enabled: !opts?.disable,
    refetchOnWindowFocus: false,
  });

  return { data: query.data, isLoading: query.isLoading, isSuccess: query.isSuccess };
}
