import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import pLimit from 'p-limit';
import { BlobDescriptor } from 'blossom-client-sdk';
import { useNostr } from '../utils/nostr';
import { nip19 } from 'nostr-tools';
import { Server, useUserServers } from './useUserServers';
import { mediaServer } from './server';
import { getCatalogClient } from '../catalog/catalogClient';
import { fetchHlsPlaylist } from '../catalog/enrichmentFetch';

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

/** Shared by every mount and every run: playlist expansion is worker-bound, and the
    worker serialises anyway, so more than a few in flight only adds latency. */
const expansionLimit = pLimit(4);

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

/** Content hash of every server listing plus the rescan counter. The counter makes
    a rescan that returns byte-identical listings still re-run ingestion and playlist
    expansion - mandatory once the button has wiped the catalog. */
const catalogSyncKeyFor = (
  pubkey: string | undefined,
  servers: Server[],
  results: Array<{ error: unknown; isError: boolean; data?: BlobDescriptor[] }>,
  rescanCount: number
): string =>
  JSON.stringify({
    pubkey,
    rescanCount,
    lists: servers.map((server, index) => ({
      server,
      error: results[index].error instanceof Error ? results[index].error.message : undefined,
      isError: results[index].isError,
      blobs: results[index].data?.map(blob => [blob.sha256, blob.size, blob.type]),
    })),
  });

export const useServerInfo = () => {
  const { servers } = useUserServers();
  const { user, signEventTemplate } = useNostr();
  const [features, setFeatures] = useState<SupportedFeatures>({});
  const [rescanCount, setRescanCount] = useState(0);

  const pubkey = user?.npub && (nip19.decode(user?.npub).data as string); // TODO validate type

  const blobs = useQueries({
    queries: servers.map(server => ({
      queryKey: ['blobs', server.name],
      queryFn: async () => {
        const protocol = mediaServer(server);
        return protocol.list(pubkey!, signEventTemplate, progress =>
          getCatalogClient().ingestServerList(pubkey!, {
            server: { url: server.url, type: server.type },
            blobs: progress.blobs,
            cursor: progress.cursor,
            state: progress.state,
            error: progress.error,
            received: progress.received,
          })
        );
      },
      enabled: !!pubkey && servers.length > 0,
      staleTime: Infinity,
      retryOnMount: false,
      refetchOnWindowFocus: false,
    })),
  });

  const catalogSyncKey = useMemo(
    () => catalogSyncKeyFor(pubkey, servers, blobs, rescanCount),
    [blobs, pubkey, rescanCount, servers]
  );
  const ingestedCatalogSyncKey = useRef<string | undefined>(undefined);

  const ingestServerLists = useCallback(
    (results = blobs) =>
      Promise.all(
        servers.map((server, index) => {
          const result = results[index];
          const state =
            server.name === 'nostr.build'
              ? 'unsupported'
              : result.isError
                ? 'failed'
                : result.data
                  ? 'complete'
                  : 'pending';
          return getCatalogClient().ingestServerList(pubkey!, {
            server: { url: server.url, type: server.type },
            blobs: result.data,
            state,
            error: result.error instanceof Error ? result.error.message : undefined,
            full: state === 'complete',
          });
        })
      ),
    [blobs, pubkey, servers]
  );

  useEffect(() => {
    if (!pubkey || ingestedCatalogSyncKey.current === catalogSyncKey) return;
    ingestedCatalogSyncKey.current = catalogSyncKey;
    void ingestServerLists();
  }, [catalogSyncKey, ingestServerLists, pubkey]);

  const expandedCatalogSyncKey = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!pubkey || expandedCatalogSyncKey.current === catalogSyncKey) return;
    expandedCatalogSyncKey.current = catalogSyncKey;
    // Candidates come from the catalog, not from the listings this hook just ingested:
    // a playlist known only from an event or from another manifest appears in no
    // listing, and scanning listings left exactly those unexpanded. Files nothing has
    // typed yet are handled by the identification sweep, which reads their bytes.
    //
    // `useQueries` hands back a fresh array on every render, so without the key guard
    // this fired on each one and started the whole candidate list again - hundreds of
    // expansions in flight at once, a saturated worker, and playlists left `pending`
    // for minutes. The limiter is module-level for the same reason: a per-run limiter
    // bounds only its own batch.
    void (async () => {
      const catalog = getCatalogClient();
      const playlists = await catalog.queryPlaylistHashes().catch(() => [] as string[]);
      await Promise.all(
        playlists.map(sha256 =>
          expansionLimit(() => catalog.enrichHls(pubkey, sha256, fetchHlsPlaylist).catch(() => undefined))
        )
      );
    })();
  }, [catalogSyncKey, pubkey]);

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

  const rescan = async () => {
    await getCatalogClient().reset();
    const results = await Promise.all(blobs.map(query => query.refetch()));
    // Rebuild deterministically before announcing: the awaited ingest means the
    // playlist-expansion effect re-run by the counter below reads a fully
    // re-ingested catalog instead of racing it.
    await ingestServerLists(results);
    ingestedCatalogSyncKey.current = catalogSyncKeyFor(pubkey, servers, results, rescanCount + 1);
    setRescanCount(count => count + 1);
  };

  return { serverInfo: allServersAggregation, distribution, setMirrorSupported, rescan };
};
