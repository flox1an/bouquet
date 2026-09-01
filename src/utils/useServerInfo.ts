import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { BlobDescriptor } from 'blossom-client-sdk';
import { useNostr } from '../utils/nostr';
import { nip19 } from 'nostr-tools';
import { Server, useUserServers } from './useUserServers';
import { fetchBlossomList } from './blossom';
import { fetchNip96List } from './nip96';
import { getCatalogClient } from '../catalog/catalogClient';
import { fetchHlsPlaylist } from '../catalog/enrichmentFetch';
import { isPlaylistCandidate } from './hlsPlaylist';

export interface ServerInfo extends Server {
  virtual: boolean;
  count: number;
  size: number;
  lastChange: number;
  isLoading: boolean;
  isError: boolean;
  blobs?: BlobDescriptor[];
  features: { mirror?: boolean };
}

type BlobDictionary = {
  [key: string]: { blob: BlobDescriptor; servers: string[] };
};

type SupportedFeatures = {
  [key: string]: { mirror?: boolean };
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
  const { servers } = useUserServers();
  const { user, signEventTemplate } = useNostr();
  const [features, setFeatures] = useState<SupportedFeatures>({});

  const pubkey = user?.npub && (nip19.decode(user?.npub).data as string); // TODO validate type

  const blobs = useQueries({
    queries: servers.map(server => ({
      queryKey: ['blobs', server.name],
      queryFn: async () => {
        if (server.name == 'nostr.build') {
          return []; // nostr.build does not support list atm
        }
        if (server.type === 'blossom') {
          return fetchBlossomList(server.url, pubkey!, signEventTemplate, progress =>
            getCatalogClient().ingestServerList(pubkey!, {
              server: { url: server.url, type: server.type },
              blobs: progress.blobs,
              cursor: progress.cursor,
              state: progress.state,
              error: progress.error,
              received: progress.received,
            })
          );
        } else if (server.type === 'nip96') {
          return fetchNip96List(server, signEventTemplate);
        }
        return [];
      },
      enabled: !!pubkey && servers.length > 0,
      staleTime: Infinity,
      retryOnMount: false,
      refetchOnWindowFocus: false,
    })),
  });

  const catalogSyncKey = useMemo(
    () =>
      JSON.stringify({
        pubkey,
        lists: servers.map((server, index) => ({
          server,
          error: blobs[index].error instanceof Error ? blobs[index].error.message : undefined,
          isError: blobs[index].isError,
          blobs: blobs[index].data?.map(blob => [blob.sha256, blob.size, blob.type]),
        })),
      }),
    [blobs, pubkey, servers]
  );
  const ingestedCatalogSyncKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!pubkey || ingestedCatalogSyncKey.current === catalogSyncKey) return;
    ingestedCatalogSyncKey.current = catalogSyncKey;
    void Promise.all(
      servers.map((server, index) => {
        const result = blobs[index];
        const state =
          server.name === 'nostr.build'
            ? 'unsupported'
            : result.isError
              ? 'failed'
              : result.data
                ? 'complete'
                : 'pending';
        return getCatalogClient().ingestServerList(pubkey, {
          server: { url: server.url, type: server.type },
          blobs: result.data,
          state,
          error: result.error instanceof Error ? result.error.message : undefined,
          full: state === 'complete',
        });
      })
    );
  }, [blobs, catalogSyncKey, pubkey, servers]);

  useEffect(() => {
    if (!pubkey) return;
    const playlistRoots = servers.flatMap((server, index) =>
      (blobs[index].data ?? []).filter(isPlaylistCandidate).map(blob => ({ blob, server }))
    );
    void Promise.all(
      playlistRoots.map(({ blob }) =>
        getCatalogClient()
          .enrichHls(pubkey, blob.sha256, fetchHlsPlaylist)
          .catch(() => undefined)
      )
    );
  }, [blobs, catalogSyncKey, pubkey, servers]);

  const setMirrorSupported = (serverName: string, supported: boolean) => {
    setFeatures(f => ({ ...f, [serverName]: { ...f[serverName], mirror: supported } }));
  };

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
        features: features[server.name] || {},
      };
    });
    return info;
  }, [servers, blobs, features]);

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
      type: 'blossom',
      features: {},
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

      if (!si.blobs) return;
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

  const rescan = () => Promise.all(blobs.map(query => query.refetch()));

  return { serverInfo: allServersAggregation, distribution, setMirrorSupported, rescan };
};
