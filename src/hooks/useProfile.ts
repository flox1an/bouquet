import { kinds } from 'nostr-tools';
import { useEventStore, useObservableMemo } from 'applesauce-react/hooks';
import type { ProfileContent } from 'applesauce-core/helpers/profile';
import type { Model } from 'applesauce-core';
import { defer, EMPTY, merge, of } from 'rxjs';
import { requestProfile } from './useBatchedProfiles';

export function useProfile(pubkey?: string): ProfileContent | undefined {
  const eventStore = useEventStore();

  function ProfileQuery(pubkey?: string): Model<ProfileContent | undefined> {
    // Return undefined if pubkey is not provided or empty/invalid
    if (!pubkey || pubkey.trim() === '') {
      return () => of(undefined);
    }

    return events =>
      merge(
        // Request profile to be loaded
        defer(() => {
          if (events.hasReplaceable(kinds.Metadata, pubkey)) return EMPTY;
          else {
            // Use batched loader for profiles
            requestProfile(pubkey);
            return EMPTY;
          }
        }),
        // Subscribe to the profile content
        events.profile(pubkey)
      );
  }

  return useObservableMemo(() => eventStore.model(ProfileQuery, pubkey), [pubkey]);
}
