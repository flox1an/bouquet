import { useMemo } from 'react';
import { useNDK } from '../utils/ndk';
import { nip19 } from 'nostr-tools';
import { NDKKind } from '@nostr-dev-kit/ndk';
import useEvent from '../utils/useEvent';
import { USER_BLOSSOM_SERVER_LIST_KIND } from 'blossom-client-sdk';

export type Server = {
  name: string;
  url: string;
};

export const useUserServers = (): Server[] => {
  const { user } = useNDK();

  const pubkey = user?.npub && (nip19.decode(user?.npub).data as string); // TODO validate type

  const serverListEvent = useEvent({ kinds: [USER_BLOSSOM_SERVER_LIST_KIND as NDKKind], authors: [pubkey!] }, { disable: !pubkey });

  const servers = useMemo(() => {
    const serverUrls = (serverListEvent?.getMatchingTags('server').map(t => t[1]) || []).map(s =>
      s.toLocaleLowerCase().replace(/\/$/, '')
    );

    return serverUrls.map(s => ({
      name: s.replace(/https?:\/\//, ''),
      url: s,
    }));
  }, [serverListEvent]);

  return servers;
};
