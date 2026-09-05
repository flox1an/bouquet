import type { BlobDescriptor } from 'blossom-client-sdk';
import type { CatalogServerType, ServerListState } from './catalog';

/** The Catalog interface a rescan needs - the worker-backed CatalogClient satisfies it too. */
type RescanCatalog = {
  reset(): Promise<void>;
  ingestServerList(
    pubkey: string,
    input: {
      server: { url: string; type: CatalogServerType };
      blobs?: BlobDescriptor[];
      state: ServerListState;
      error?: string;
      full?: boolean;
    }
  ): Promise<void>;
};

export type RescanServer = { url: string; type: CatalogServerType; name: string };
export type RescanReport = {
  serverId: string;
  received: number;
  state: ServerListState;
  error?: string;
};

/**
 * A Rescan rebuilds the catalog: wipe, refetch every server's complete listing,
 * and ingest it as authoritative presence evidence (ADR-0006 - missing from a
 * full listing removes presence). The sequencing lives here, not in a hook, so
 * the ordering - reset strictly before the first fetch, ingest awaited before
 * anyone is told the rescan finished - is testable and cannot drift.
 */
export async function rescanCatalog(
  catalog: RescanCatalog,
  args: {
    pubkey: string;
    servers: RescanServer[];
    /** The MediaServer seam: (server) => server.list(...). Injected at the boundary. */
    list: (server: RescanServer) => Promise<BlobDescriptor[]>;
  }
): Promise<RescanReport[]> {
  await catalog.reset();
  const reports: RescanReport[] = [];
  for (const server of args.servers) {
    try {
      const blobs = await args.list(server);
      await catalog.ingestServerList(args.pubkey, {
        server: { url: server.url, type: server.type },
        blobs,
        state: 'complete',
        full: true,
      });
      reports.push({ serverId: server.url, received: blobs.length, state: 'complete' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await catalog.ingestServerList(args.pubkey, {
        server: { url: server.url, type: server.type },
        state: 'failed',
        error: message,
      });
      reports.push({ serverId: server.url, received: 0, state: 'failed', error: message });
    }
  }
  return reports;
}
