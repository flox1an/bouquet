import { useMemo } from 'react';
import useEvents from '../utils/useEvents';
import type { Filter } from 'nostr-tools';
import countBy from 'lodash/countBy';
import sortBy from 'lodash/sortBy';
import toPairs from 'lodash/toPairs';
import { USER_BLOSSOM_SERVER_LIST_KIND } from 'blossom-client-sdk';

const blossomServerListFilter: Filter = { kinds: [USER_BLOSSOM_SERVER_LIST_KIND] };

const useBlossomServerEvents = () => {
  const blossomServerEvents = useEvents(blossomServerListFilter);

  const blossomServers = useMemo(() => {
    const allRTags = blossomServerEvents.events.flatMap(
      ev => ev.tags.filter(t => t[0] == 'r' || t[0] == 'server').flatMap(t => ({ name: t[1] }))
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
