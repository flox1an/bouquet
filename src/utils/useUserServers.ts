import { useMemo } from 'react';
import { useNDK } from '../utils/ndk';
import { nip19 } from 'nostr-tools';
import { NDKEvent, NDKKind } from '@nostr-dev-kit/ndk';
import { USER_BLOSSOM_SERVER_LIST_KIND } from 'blossom-client-sdk';
import useEvent from './useEvent';
import { useQueries } from '@tanstack/react-query';
import { Nip96ServerConfig, fetchNip96ServerConfig } from './nip96';
import dayjs from 'dayjs';

type ServerType = 'blossom' | 'nip96';

export type Server = {
  type: ServerType;
  name: string;
  url: string;
  message?: string;
  nip96?: Nip96ServerConfig;
};

export const USER_NIP96_SERVER_LIST_KIND = 10096;

export const useUserServers = (): {
  servers: Server[];
  serversLoading: boolean;
  storeUserServers: (newServers: Server[]) => Promise<void>;
} => {
  const { user, ndk } = useNDK();
  const pubkey = user?.npub && (nip19.decode(user?.npub).data as string); // TODO validate type

  const storeUserServers = async (newServers: Server[]) => {
    if (!pubkey) return;
    const ev = new NDKEvent(ndk, {
      kind: USER_BLOSSOM_SERVER_LIST_KIND,
      created_at: dayjs().unix(),
      content: '',
      pubkey,
      tags: newServers.filter(s => s.type == 'blossom').map(s => ['server', `${s.url}`]),
    });
    await ev.sign();
    console.log(ev.rawEvent());
    await ev.publish();

    const evNip96 = new NDKEvent(ndk, {
      kind: USER_NIP96_SERVER_LIST_KIND,
      created_at: dayjs().unix(),
      content: '',
      pubkey,
      tags: newServers.filter(s => s.type == 'nip96').map(s => ['server', `${s.url}`]),
    });
    await evNip96.sign();
    console.log(evNip96.rawEvent());
    await evNip96.publish();
  };

  const blossomServerListEvent = useEvent(
    { kinds: [USER_BLOSSOM_SERVER_LIST_KIND as NDKKind], authors: [pubkey!] },
    { disable: !pubkey }
  );

  const nip96ServerListEvent = useEvent(
    { kinds: [USER_NIP96_SERVER_LIST_KIND as NDKKind], authors: [pubkey!] },
    { disable: !pubkey }
  );

  const blossomServers = useMemo((): Server[] | undefined => {
    if (!blossomServerListEvent || !blossomServerListEvent.isSuccess) return undefined;
    return (blossomServerListEvent?.data?.getMatchingTags('server').map(t => t[1]) || []).map(s => {
      const url = s.toLocaleLowerCase().replace(/\/$/, '');

      return {
        url,
        name: url.replace(/https?:\/\//, ''),
        type: 'blossom' as ServerType,
      };
    });
  }, [blossomServerListEvent]);

  const nip96Servers = useMemo((): Server[] | undefined => {
    if (!user || !blossomServerListEvent || !blossomServerListEvent.isSuccess) return undefined;
    return [
      ...(nip96ServerListEvent?.data?.getMatchingTags('server').map(t => t[1]) || []).map(s => {
        const url = s.toLocaleLowerCase().replace(/\/$/, '');
        const name = url.replace(/https?:\/\//, '');
        return {
          url,
          name,
          type: 'nip96' as ServerType,
          message: name == 'nostr.build' ? 'nostr.build does currently not support listing files' : undefined,
        };
      }),
    ];
  }, [nip96ServerListEvent]);

  const nip96InfoQueries = useQueries({
    queries: (nip96Servers || []).map(server => ({
      queryKey: ['nip96info', server.url],
      queryFn: async () => await fetchNip96ServerConfig(server.url),
    })),
  });

  const servers = useMemo((): Server[] => {
    return [
      ...(blossomServers || []),
      ...(nip96Servers || []).map((server, index) => ({ ...server, nip96: nip96InfoQueries[index].data })),
    ];
  }, [blossomServers, nip96Servers, nip96InfoQueries]);

  return {
    servers,
    serversLoading: blossomServerListEvent?.isLoading || nip96ServerListEvent?.isLoading,
    storeUserServers,
  };
};
