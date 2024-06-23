import { useMemo } from 'react';
import { useNDK } from '../utils/ndk';
import { nip19 } from 'nostr-tools';
import { NDKKind } from '@nostr-dev-kit/ndk';
import { USER_BLOSSOM_SERVER_LIST_KIND } from 'blossom-client-sdk';
import useEvent from './useEvent';

type ServerType = 'blossom' | 'nip96';

export type Server = {
  type: ServerType;
  name: string;
  url: string;
};

const USER_NIP96_SERVER_LIST_KIND = 10096;

export const useUserServers = (): Server[] => {
  const { user } = useNDK();

  const pubkey = user?.npub && (nip19.decode(user?.npub).data as string); // TODO validate type

  const blossomServerListEvent = useEvent(
    { kinds: [USER_BLOSSOM_SERVER_LIST_KIND as NDKKind], authors: [pubkey!] },
    { disable: !pubkey }
  );

  const nip96ServerListEvent = useEvent(
    { kinds: [USER_NIP96_SERVER_LIST_KIND as NDKKind], authors: [pubkey!] },
    { disable: !pubkey }
  );

  const servers = useMemo((): Server[] => {
    const serverUrls = [
      ...(blossomServerListEvent?.getMatchingTags('server').map(t => t[1]) || []).map(s => ({
        url: s.toLocaleLowerCase().replace(/\/$/, ''),
        type: 'blossom' as ServerType,
      })),
     /* ...(nip96ServerListEvent?.getMatchingTags('server').map(t => t[1]) || []).map(s => ({
        url: s.toLocaleLowerCase().replace(/\/$/, ''),
        type: 'nip96' as ServerType,
      })),*/
    ];

    return serverUrls.map(s => ({
      type: s.type,
      name: s.url.replace(/https?:\/\//, ''),
      url: s.url,
    }));
  }, [blossomServerListEvent, nip96ServerListEvent]);
  
  // console.log(servers);
  return servers;
};
