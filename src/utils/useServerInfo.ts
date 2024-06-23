import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { BlobDescriptor, BlossomClient } from 'blossom-client-sdk';
import { useNDK } from '../utils/ndk';
import { nip19 } from 'nostr-tools';
import { Server, useUserServers } from './useUserServers';
import dayjs from 'dayjs';

export interface ServerInfo extends Server {
  virtual: boolean;
  count: number;
  size: number;
  lastChange: number;
  isLoading: boolean;
  isError: boolean;
  blobs?: BlobDescriptor[];
};

type BlobDictionary = {
  [key: string]: { blob: BlobDescriptor; servers: string[] };
};

const mergeBlobs = (
  baseBlobs: BlobDescriptor[],
  newBlobs: BlobDescriptor[],
  existingBlobs: { [key: string]: boolean }
): BlobDescriptor[] => {
  const result = [...baseBlobs];
  for (const blob of newBlobs) {
    if (!existingBlobs[blob.sha256]) {
      existingBlobs[blob.sha256] = true;
      result.push(blob);
    }
  }
  return result;
};

export const useServerInfo = () => {
  const servers = useUserServers();
  const { user, signEventTemplate } = useNDK();

  const pubkey = user?.npub && (nip19.decode(user?.npub).data as string); // TODO validate type

  const blobs = useQueries({
    queries: servers.map(server => ({
      queryKey: ['blobs', server.name],
      queryFn: async () => {
        const listAuthEvent = await BlossomClient.getListAuth(signEventTemplate, 'List Blobs');
        const blobs = await BlossomClient.listBlobs(server.url, pubkey!, undefined, listAuthEvent);

        // fallback to deprecated created attibute for servers that are not using 'uploaded' yet
        return blobs.map(b => ({ ...b, uploaded: b.uploaded || b.created || dayjs().unix() }));
      },
      enabled: !!pubkey && servers.length > 0,
      staleTime: 1000 * 60 * 5,
      retryOnMount: false,
    })),
  });

  const serverInfo = useMemo(() => {
    const info: { [key: string]: ServerInfo } = {};
    servers.forEach((server, sx) => {
      info[server.name] = {
        ...server,
        virtual: false,
        blobs: blobs[sx].data,
        isLoading: blobs[sx].isLoading,
        isError: blobs[sx].isError,
        count: blobs[sx].data?.length || 0,
        size: blobs[sx].data?.reduce((acc, blob) => acc + blob.size, 0) || 0,
        lastChange: blobs[sx].data?.reduce((acc, blob) => Math.max(acc, blob.uploaded), 0) || 0,
      };
    });
    return info;
  }, [servers, blobs]);

  const allServersAggregation = useMemo(() => {
    const serversInfos = Object.values(serverInfo);
    const existingBlobs: { [key: string]: boolean } = {};
    const initial: ServerInfo = {
      virtual: true,
      count: 0,
      size: 0,
      lastChange: 0,
      isLoading: false,
      isError: false,
      name: 'All servers',
      url: 'all',
      blobs: [],
      type: 'blossom'
    };
    const allInfo = serversInfos.reduce(
      (acc, server) => ({
        ...acc,
        lastChange: Math.max(acc.lastChange, server.lastChange),
        isLoading: acc.isLoading || server.isLoading,
        isError: acc.isError || server.isError,
        blobs: mergeBlobs(acc.blobs || [], server.blobs || [], existingBlobs),
      }),
      initial
    );
    allInfo.size = allInfo.blobs?.reduce((acc, blob) => acc + blob.size, 0) || 0;
    allInfo.count = allInfo.blobs?.length || 0;

    return { [allInfo.name]: allInfo, ...serverInfo };
  }, [serverInfo]);

  const distribution = useMemo(() => {
    const dict: BlobDictionary = {};

    servers.forEach(server => {
      const si = serverInfo[server.name];

      si.blobs &&
        si.blobs.forEach((blob: BlobDescriptor) => {
          if (dict[blob.sha256]) {
            dict[blob.sha256].servers.push(server.name);
          } else {
            dict[blob.sha256] = {
              blob,
              servers: [server.name],
            };
          }
        });
    });
    return dict;
  }, [servers, serverInfo]);

  return { serverInfo: allServersAggregation, distribution };
};
