import { useMemo } from 'react';
import { useServers } from './useServers';
import { useQueries } from '@tanstack/react-query';
import { BlobDescriptor, BlossomClient } from 'blossom-client-sdk';
import { useNDK } from '../ndk';
import { nip19 } from 'nostr-tools';

export type ServerInfo = {
  count: number;
  size: number;
  lastChange: number;
  isLoading: boolean;
  name: string;
  url: string;
  blobs?: BlobDescriptor[];
};

export const useServerInfo = () => {
  const servers = useServers();
  const { user, signEventTemplate } = useNDK();

  const pubkey = user?.npub && (nip19.decode(user?.npub).data as string); // TODO validate type

  const blobs = useQueries({
    queries: servers.map(server => ({
      queryKey: ['blobs', server.name],
      queryFn: async () => {
        const listAuthEvent = await BlossomClient.getListAuth(signEventTemplate, 'List Blobs');
        return await BlossomClient.listBlobs(server.url, pubkey!, undefined, listAuthEvent);
      },
      enabled: !!pubkey && servers.length > 0,
      staleTime: 1000 * 60 * 5,
    })),
  });

  const serverInfo = useMemo(() => {
    const info: { [key: string]: ServerInfo } = {};
    servers.forEach((server, sx) => {
      info[server.name] = {
        ...server,
        blobs: blobs[sx].data,
        isLoading: blobs[sx].isLoading,
        count: blobs[sx].data?.length || 0,
        size: blobs[sx].data?.reduce((acc, blob) => acc + blob.size, 0) || 0,
        lastChange:
          blobs[sx].data?.reduce(
            (acc, blob) =>
              Math.max(
                acc,
                blob.created > 1711200000000 // fix for wrong timestamps on media-server.slidestr.net (remove)
                  ? blob.created / 1000
                  : blob.created
              ),
            0
          ) || 0,
      };
    });
    return info;
  }, [servers, blobs]);

  return serverInfo;
};
