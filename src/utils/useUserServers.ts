import { useMemo } from 'react';
import { useNDK } from '../utils/ndk';
import { nip19 } from 'nostr-tools';
import { NDKKind } from '@nostr-dev-kit/ndk';
import { USER_BLOSSOM_SERVER_LIST_KIND } from 'blossom-client-sdk';
import useEvent from './useEvent';
import { useQueries } from '@tanstack/react-query';
import { Nip96ServerConfig, fetchNip96ServerConfig } from './nip96';

type ServerType = 'blossom' | 'nip96';

export type Server = {
  type: ServerType;
  name: string;
  url: string;
  message?: string;
  nip96?: Nip96ServerConfig;
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

  const blossomServers = useMemo((): Server[] => {
    return (blossomServerListEvent?.getMatchingTags('server').map(t => t[1]) || []).map(s => {
      const url = s.toLocaleLowerCase().replace(/\/$/, '');

      return {
        url,
        name: url.replace(/https?:\/\//, ''),
        type: 'blossom' as ServerType,
      };
    });
  }, [blossomServerListEvent]);

  const nip96Servers = useMemo((): Server[] => {
    return [
      /*...(nip96ServerListEvent?.getMatchingTags('server').map(t => t[1]) || []).map(s => {
      const url = s.toLocaleLowerCase().replace(/\/$/, '');

      return {
        url,
        name: url.replace(/https?:\/\//, ''),
        type: 'nip96' as ServerType,
      };
    }),*/ {
        url: 'https://nostrcheck.me',
        name: 'nostrcheck.me',
        type: 'nip96' as ServerType,
      },
      {
        url: 'https://nostr.build',
        name: 'nostr.build',
        type: 'nip96' as ServerType,
        message: 'nostr.build does currently not support listing files',
      },
    ];
  }, [nip96ServerListEvent]);

  const nip96InfoQueries = useQueries({
    queries: nip96Servers.map(server => ({
      queryKey: ['nip96info', server.url],
      queryFn: async () => await fetchNip96ServerConfig(server.url),
    })),
  });

  const servers = useMemo((): Server[] => {
    return [
      ...blossomServers,
      ...nip96Servers.map((server, index) => ({ ...server, nip96: nip96InfoQueries[index].data })),
    ];
  }, [blossomServers, nip96Servers, nip96InfoQueries]);

  return servers;
};
