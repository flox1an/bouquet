import { useMemo } from 'react';
import useEvents from '../useEvents';
import { NDKKind } from '@nostr-dev-kit/ndk';
import countBy from 'lodash/countBy';
import sortBy from 'lodash/sortBy';
import toPairs from 'lodash/toPairs';

const blossomServerListFilter = { kinds: [10063 as NDKKind] };

const useBlossomServerEvents = () => {
  const blossomServerEvents = useEvents(blossomServerListFilter);

  const blossomServers = useMemo(() => {
    const allRTags = blossomServerEvents.events.flatMap(ev =>
      ev.tags.filter(t => t[0] == 'r').flatMap(t => ({ name: t[1] }))
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
