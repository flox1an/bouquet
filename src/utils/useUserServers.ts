import { useMemo } from 'react';
import { uniqAndSort } from '../utils/utils';
import { useNDK } from '../utils/ndk';
import { nip19 } from 'nostr-tools';
import { NDKKind } from '@nostr-dev-kit/ndk';
import useEvent from '../utils/useEvent';

const additionalServers = ['https://cdn.satellite.earth'];

export type Server = {
  name: string;
  url: string;
};

export const useUserServers = (): Server[] => {
  const { user } = useNDK();

  const pubkey = user?.npub && (nip19.decode(user?.npub).data as string); // TODO validate type

  const serverListEvent = useEvent({ kinds: [10063 as NDKKind], authors: [pubkey!] }, { disable: !pubkey });

  const servers = useMemo(() => {
    const serverUrls = uniqAndSort(
      [
        ...(serverListEvent?.getMatchingTags('r').map(t => t[1]) || []),  // TODO 'r' is deprecated
        ...(serverListEvent?.getMatchingTags('server').map(t => t[1]) || []),
        ...additionalServers,
      ].map(s => s.toLocaleLowerCase().replace(/\/$/, ''))
    );
    return serverUrls.map(s => ({
      name: s.replace(/https?:\/\//, ''),
      url: s,
    }));
  }, [serverListEvent]);

  return servers;
};
