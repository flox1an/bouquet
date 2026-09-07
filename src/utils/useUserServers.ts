import { useMemo } from 'react';
import { useNostr } from '../utils/nostr';
import { nip19 } from 'nostr-tools';
import type { Filter, NostrEvent } from 'nostr-tools';
import { USER_BLOSSOM_SERVER_LIST_KIND } from 'blossom-client-sdk';
import useEvent from './useEvent';
import { useQueries } from '@tanstack/react-query';
import { Nip96ServerConfig, fetchNip96ServerConfig } from './nip96';
import dayjs from 'dayjs';
import { mergeRelays } from '../nostr/core';
import { signAndPublish, type PublishResult } from './publish';

type ServerType = 'blossom' | 'nip96';

export type Server = {
  type: ServerType;
  name: string;
  url: string;
  message?: string;
  nip96?: Nip96ServerConfig;
};

export const USER_NIP96_SERVER_LIST_KIND = 10096;

// Helper to get tag values from an event
const getMatchingTags = (event: NostrEvent | undefined, tagName: string): string[][] => {
  if (!event) return [];
  return event.tags.filter(t => t[0] === tagName);
};

export type StoreServersResult = { blossom: PublishResult; nip96: PublishResult };

export const useUserServers = (): {
  servers: Server[];
  serversLoading: boolean;
  storeUserServers: (newServers: Server[]) => Promise<StoreServersResult>;
} => {
  const { user } = useNostr();
  const pubkey = user?.npub && (nip19.decode(user?.npub).data as string);

  const storeUserServers = async (newServers: Server[]): Promise<StoreServersResult> => {
    if (!pubkey) throw new Error('No active user');

    const relays = mergeRelays(user?.relayUrls);

    const blossomTemplate: Omit<NostrEvent, 'id' | 'sig'> = {
      kind: USER_BLOSSOM_SERVER_LIST_KIND,
      created_at: dayjs().unix(),
      content: '',
      pubkey,
      tags: newServers.filter(s => s.type == 'blossom').map(s => ['server', `${s.url}`]),
    };

    const nip96Template: Omit<NostrEvent, 'id' | 'sig'> = {
      kind: USER_NIP96_SERVER_LIST_KIND,
      created_at: dayjs().unix(),
      content: '',
      pubkey,
      tags: newServers.filter(s => s.type == 'nip96').map(s => ['server', `${s.url}`]),
    };

    const [blossom, nip96] = await Promise.all([
      signAndPublish(blossomTemplate, relays),
      signAndPublish(nip96Template, relays),
    ]);

    return { blossom, nip96 };
  };

  const blossomServerListEvent = useEvent({ kinds: [USER_BLOSSOM_SERVER_LIST_KIND], authors: [pubkey!] } as Filter, {
    disable: !pubkey,
  });

  const nip96ServerListEvent = useEvent({ kinds: [USER_NIP96_SERVER_LIST_KIND], authors: [pubkey!] } as Filter, {
    disable: !pubkey,
  });

  const blossomServers = useMemo((): Server[] | undefined => {
    if (!blossomServerListEvent || !blossomServerListEvent.isSuccess) return undefined;
    return (getMatchingTags(blossomServerListEvent?.data, 'server').map(t => t[1]) || []).map(s => {
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
      ...(getMatchingTags(nip96ServerListEvent?.data, 'server').map(t => t[1]) || []).map(s => {
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
    // This memo also reads `user` and `blossomServerListEvent`. Without them the
    // NIP-96 list stays undefined whenever the blossom query resolves second.
  }, [user, blossomServerListEvent, nip96ServerListEvent]);

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
