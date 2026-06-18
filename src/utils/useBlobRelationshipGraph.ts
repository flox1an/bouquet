import { useEffect, useMemo, useState } from 'react';
import type { BlobDescriptor } from 'blossom-client-sdk';
import type { Filter } from 'nostr-tools';
import useEvents from './useEvents';
import { useNostr } from './nostr';
import {
  buildBlobRelationshipGraph,
  isHlsPlaylistBody,
  isPlaylistCandidate,
  parseHlsPlaylist,
  RELATIONSHIP_EVENT_KINDS,
  type BlobRelationshipGraph,
} from './blobRelationshipGraph';

type RelationshipGraphState = {
  graph: BlobRelationshipGraph;
  loading: boolean;
  relaysReady: boolean;
  playlistFetches: number;
};

const PLAYLIST_FETCH_CONCURRENCY = 4;
const PLAYLIST_FETCH_LIMITS = {
  maxDepth: 3,
  maxDescendants: 200,
};

const EMPTY_EVENTS: never[] = [];

export function useBlobRelationshipGraph(blobs: BlobDescriptor[], enabled = true): RelationshipGraphState {
  const { user, relaysReady } = useNostr();
  const [playlistBodies, setPlaylistBodies] = useState<Map<string, string | undefined>>(() => new Map());
  const [playlistLoading, setPlaylistLoading] = useState(false);

  const eventFilter = useMemo(
    () =>
      ({
        kinds: [...RELATIONSHIP_EVENT_KINDS],
        authors: user?.pubkey ? [user.pubkey] : [],
        limit: 100,
      }) as Filter,
    [user?.pubkey]
  );
  const eventSub = useEvents(eventFilter, { disable: !enabled || !user?.pubkey });

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const candidates = blobs.filter(isPlaylistCandidate).map(blob => blob.url);

    if (candidates.length === 0) {
      setPlaylistBodies(new Map());
      setPlaylistLoading(false);
      return;
    }

    setPlaylistLoading(true);

    void (async () => {
      const bodies = new Map<string, string | undefined>();
      const queue = candidates.map(url => ({ url, depth: 0 }));
      const queued = new Set(candidates);
      let cursor = 0;
      let descendants = 0;

      const fetchOne = async (url: string): Promise<string | undefined> => {
        try {
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) return undefined;
          return await response.text();
        } catch {
          return undefined;
        }
      };

      while (cursor < queue.length && !controller.signal.aborted) {
        const batch = queue.slice(cursor, cursor + PLAYLIST_FETCH_CONCURRENCY);
        cursor += batch.length;
        const results = await Promise.all(batch.map(item => fetchOne(item.url)));

        for (let index = 0; index < batch.length; index += 1) {
          const item = batch[index];
          const body = results[index];
          bodies.set(item.url, body);
          if (!body || !isHlsPlaylistBody(body)) continue;
          if (item.depth >= PLAYLIST_FETCH_LIMITS.maxDepth) continue;

          for (const childUrl of parseHlsPlaylist(item.url, body).playlistUrls) {
            descendants += 1;
            if (descendants > PLAYLIST_FETCH_LIMITS.maxDescendants) break;
            if (queued.has(childUrl)) continue;
            queued.add(childUrl);
            queue.push({ url: childUrl, depth: item.depth + 1 });
          }
        }
      }

      if (!controller.signal.aborted) {
        setPlaylistBodies(bodies);
        setPlaylistLoading(false);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [blobs, enabled]);

  const events = enabled ? eventSub.events : EMPTY_EVENTS;
  const graph = useMemo(
    () =>
      buildBlobRelationshipGraph({
        blobs,
        events,
        playlistBodies,
        limits: PLAYLIST_FETCH_LIMITS,
      }),
    [blobs, events, playlistBodies]
  );

  return {
    graph,
    loading: eventSub.loading || playlistLoading || (!!user && !relaysReady),
    relaysReady: !user || relaysReady,
    playlistFetches: playlistBodies.size,
  };
}
