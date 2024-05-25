import { useMemo } from 'react';
import useEvents from '../utils/useEvents';
import { NDKKind } from '@nostr-dev-kit/ndk';
import countBy from 'lodash/countBy';
import sortBy from 'lodash/sortBy';
import toPairs from 'lodash/toPairs';
import { USER_BLOSSOM_SERVER_LIST_KIND } from 'blossom-client-sdk';

const blossomServerListFilter = { kinds: [USER_BLOSSOM_SERVER_LIST_KIND as NDKKind] };

const useBlossomServerEvents = () => {
  const blossomServerEvents = useEvents(blossomServerListFilter);

  const blossomServers = useMemo(() => {
    const allRTags = blossomServerEvents.events.flatMap(
      ev => ev.tags.filter(t => t[0] == 'r' || t[0] == 'server').flatMap(t => ({ name: t[1] })) // TODO 'r' is deprecated
    );
    const cnt = countBy(
      allRTags.filter(s => !s.name.match(/https?:\/\/localhost/)),
      'name'
    );
    return sortBy(toPairs(cnt), 1).reverse();
  }, [blossomServerEvents.events]);

  return blossomServers;
};

export default useBlossomServerEvents;
