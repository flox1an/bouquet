/**
 * @vitest-environment jsdom
 */
// Reachable deletion coverage lives here; BlobList is transfer-only.
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement as h } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TimelineItem } from './browseConstants';
import type { ServerInfo } from '../../utils/useServerInfo';
import { BrowseActionPlanDialog } from './BrowseActionPlanDialog';

const planCatalogAction = vi.fn();
const getAssetReplicaMap = vi.fn();
const recordBlobsRemoved = vi.fn();
const ingestUpload = vi.fn();
const refreshReplicaAvailability = vi.fn();
const deleteBlob = vi.fn();
const createDeleteAuth = vi.fn();
const { transferBlob } = vi.hoisted(() => ({ transferBlob: vi.fn() }));

vi.mock('../../catalog/catalogClient', () => ({
  getCatalogClient: () => ({
    planCatalogAction,
    getAssetReplicaMap,
    recordBlobsRemoved,
    ingestUpload,
    refreshReplicaAvailability,
  }),
}));
vi.mock('../../utils/server', () => {
  // The real seam decodes raw HTTP statuses into MediaServerError kinds before
  // anything outside sees them - the fake honours that contract.
  class MediaServerError extends Error {
    constructor(
      readonly kind: string,
      message: string
    ) {
      super(message);
    }
  }
  return {
    MediaServerError,
    mediaServer: (server: { url: string }) => ({
      capabilities: { mirror: true },
      delete: async (hash: string) => {
        try {
          return await deleteBlob(server.url, hash, {});
        } catch (error) {
          const status = (error as { status?: number }).status;
          const kind =
            status === 404 || status === 410 ? 'not-found' : status === 401 || status === 403 ? 'auth' : 'server';
          throw new MediaServerError(kind, String(error));
        }
      },
    }),
  };
});
vi.mock('../../utils/transfer', () => ({ transferBlob }));

afterEach(() => {
  cleanup();
  planCatalogAction.mockReset();
  getAssetReplicaMap.mockReset();
  recordBlobsRemoved.mockReset();
  deleteBlob.mockReset();
  createDeleteAuth.mockReset();
  ingestUpload.mockReset();
  refreshReplicaAvailability.mockReset();
  transferBlob.mockReset();
});

const item = (assetId: string): TimelineItem =>
  ({
    id: assetId,
    pubkey: 'pk',
    assetId,
    displayType: 'image',
    displayTitle: 'A picture',
    displayTitleIsFallback: false,
    searchText: 'a picture',
    displayDate: 1_700_000_000_000,
    displayDateSource: 'event',
    blobCount: 1,
    totalBlobSize: 10,
    unknownBlobSizeCount: 0,
    replicaCount: 1,
    availabilityState: 'complete',
    metadataCompleteness: 'complete',
  }) as TimelineItem;

const server = (name: string, url: string): ServerInfo =>
  ({
    name,
    url,
    type: 'blossom',
    virtual: false,
    count: 1,
    size: 100,
    lastChange: 0,
    isLoading: false,
    isError: false,
    features: {},
  }) as ServerInfo;

const renderDialog = (
  assets: TimelineItem[],
  overrides: { action?: 'mirror' | 'sync' | 'delete'; serverInfo?: Record<string, ServerInfo> } = {}
) => {
  const queryClient = new QueryClient();
  return render(
    h(
      QueryClientProvider,
      { client: queryClient },
      h(BrowseActionPlanDialog, {
        open: true,
        action: overrides.action ?? 'delete',
        assets,
        pubkey: 'pk',
        serverInfo: overrides.serverInfo ?? {},
        signEventTemplate: vi.fn(),
        onClose: vi.fn(),
        onDeleted: vi.fn(),
      })
    )
  );
};

describe('BrowseActionPlanDialog', () => {
  it('does not restart planning when a background refresh hands it a new-but-equivalent asset list', async () => {
    planCatalogAction.mockResolvedValue({ allowed: true, targets: ['a'.repeat(64)] });
    getAssetReplicaMap.mockResolvedValue([]);

    const { rerender } = renderDialog([item('asset-1')]);
    await vi.waitFor(() => expect(screen.getByText(/cannot be undone/i)).toBeTruthy());
    expect(planCatalogAction).toHaveBeenCalledTimes(1);

    // Same selection, brand-new array/object references - what a background
    // catalog re-projection produces. The dialog must stay put, not flash back
    // to "Planning…".
    const queryClient = new QueryClient();
    rerender(
      h(
        QueryClientProvider,
        { client: queryClient },
        h(BrowseActionPlanDialog, {
          open: true,
          action: 'delete',
          assets: [item('asset-1')],
          pubkey: 'pk',
          serverInfo: {},
          signEventTemplate: vi.fn(),
          onClose: vi.fn(),
          onDeleted: vi.fn(),
        })
      )
    );

    expect(screen.queryByText(/Planning…/i)).toBeNull();
    expect(screen.getByText(/cannot be undone/i)).toBeTruthy();
    expect(planCatalogAction).toHaveBeenCalledTimes(1);
  });

  it('keeps the chosen mirror destination while replanning', async () => {
    planCatalogAction.mockResolvedValue({ allowed: true, targets: ['a'.repeat(64)] });
    getAssetReplicaMap.mockResolvedValue([]);

    renderDialog([item('asset-1')], {
      action: 'mirror',
      serverInfo: { destination: server('destination', 'https://destination.example') },
    });

    await vi.waitFor(() => expect(screen.getByRole('button', { name: /Choose a destination server/i })).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: /Choose a destination server/i }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: /destination/i }));

    await vi.waitFor(() => {
      const mirror = screen.getByRole('button', { name: 'Mirror 1 file' });
      expect(mirror.hasAttribute('disabled')).toBe(false);
      expect(screen.getByRole('button', { name: /destination/i })).toBeTruthy();
    });
  });

  it('transfers to a mirror destination when the virtual all-servers entry is present', async () => {
    const hash = 'a'.repeat(64);
    const destination = server('destination', 'https://destination.example');
    planCatalogAction.mockResolvedValue({ allowed: true, targets: [hash] });
    getAssetReplicaMap.mockResolvedValue([
      {
        sha256: hash,
        assetId: 'asset-1',
        role: 'main',
        sources: [{ serverId: 'https://source.example', baseUrl: 'https://source.example', serverType: 'blossom' }],
        presentOn: ['https://source.example'],
        absentFrom: [{ serverId: destination.url, baseUrl: destination.url }],
      },
    ]);
    transferBlob.mockResolvedValue({
      sha256: hash,
      url: `${destination.url}/${hash}`,
      type: 'image/jpeg',
      size: 1,
      uploaded: 1,
    });
    ingestUpload.mockResolvedValue(undefined);
    refreshReplicaAvailability.mockResolvedValue(undefined);

    renderDialog([item('asset-1')], {
      action: 'mirror',
      serverInfo: {
        all: { ...server('All servers', 'all'), virtual: true },
        destination,
      },
    });

    await vi.waitFor(() => expect(screen.getByRole('button', { name: /Choose a destination server/i })).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: /Choose a destination server/i }));
    await userEvent.click(screen.getByRole('menuitemradio', { name: /destination/i }));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Mirror 1 file' }).hasAttribute('disabled')).toBe(false));
    await userEvent.click(screen.getByRole('button', { name: 'Mirror 1 file' }));

    await vi.waitFor(() =>
      expect(transferBlob).toHaveBeenCalledWith(
        `https://source.example/${hash}`,
        expect.objectContaining({ url: destination.url }),
        expect.any(Function),
        expect.any(Object)
      )
    );
  });

  it('shows a per-server breakdown, tells "already gone" apart from failure, and updates the catalog on success', async () => {
    const hashA = 'a'.repeat(64);
    planCatalogAction.mockResolvedValue({ allowed: true, targets: [hashA] });
    getAssetReplicaMap.mockResolvedValue([
      {
        sha256: hashA,
        assetId: 'asset-1',
        role: 'main',
        size: 1024,
        sources: [
          { serverId: 'https://one.example', baseUrl: 'https://one.example', serverType: 'blossom' },
          { serverId: 'https://two.example', baseUrl: 'https://two.example', serverType: 'blossom' },
        ],
        presentOn: ['https://one.example', 'https://two.example'],
        absentFrom: [],
      },
    ]);
    recordBlobsRemoved.mockResolvedValue(undefined);
    createDeleteAuth.mockResolvedValue({ id: 'auth-event' });
    // one.example deletes cleanly; two.example already 404s - both count as gone,
    // neither is a failure the user needs to retry.
    deleteBlob.mockImplementation(async (url: string) => {
      if (url.includes('two.example')) {
        const error = new Error('not found') as Error & { status: number };
        error.status = 404;
        throw error;
      }
      return true;
    });

    renderDialog([item('asset-1')], {
      serverInfo: { one: server('one', 'https://one.example'), two: server('two', 'https://two.example') },
    });

    await vi.waitFor(() => expect(screen.getByText(/Servers affected \(2\)/i)).toBeTruthy());
    expect(screen.getByText('one')).toBeTruthy();
    expect(screen.getByText('two')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /Delete 1 file/i }));

    await vi.waitFor(() => expect(screen.getByText(/1 deleted, 1 already gone, 0 failed/i)).toBeTruthy());
    expect(screen.getByText('Already gone from this server.')).toBeTruthy();

    // Both servers confirmed the blob gone (one by deleting it, one already 404),
    // so both must be recorded as removed - not just the one that actually deleted it.
    expect(recordBlobsRemoved).toHaveBeenCalledTimes(1);
    const removals = recordBlobsRemoved.mock.calls[0][1] as { sha256: string; serverUrl: string }[];
    expect(removals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sha256: hashA, serverUrl: 'https://one.example' }),
        expect.objectContaining({ sha256: hashA, serverUrl: 'https://two.example' }),
      ])
    );
  });

  it('deletes from a server the catalog confirms present even when its live blob list is not loaded', async () => {
    // Reproduces the reported bug: the Browse server filter (catalog-backed) shows
    // the file on "almond", but the live per-server blob list for that server -
    // what `distribution` used to be built from - has not resolved (still loading,
    // erroring, or simply not in the user's currently configured server list). The
    // dialog must still find and delete it, because the catalog already knows.
    const hashA = 'a'.repeat(64);
    planCatalogAction.mockResolvedValue({ allowed: true, targets: [hashA] });
    getAssetReplicaMap.mockResolvedValue([
      {
        sha256: hashA,
        assetId: 'asset-1',
        role: 'main',
        size: 2048,
        sources: [
          { serverId: 'https://almond.slidetr.net', baseUrl: 'https://almond.slidetr.net', serverType: 'blossom' },
        ],
        presentOn: ['https://almond.slidetr.net'],
        absentFrom: [],
      },
    ]);
    recordBlobsRemoved.mockResolvedValue(undefined);
    createDeleteAuth.mockResolvedValue({ id: 'auth-event' });
    deleteBlob.mockResolvedValue(true);

    // No entry for almond in serverInfo at all - exactly what "live list not
    // loaded" or "not currently configured" looks like from the dialog's side.
    renderDialog([item('asset-1')], { serverInfo: {} });

    await vi.waitFor(() => expect(screen.getByText(/Servers affected \(1\)/i)).toBeTruthy());
    expect(screen.queryByText(/not found on any known server/i)).toBeNull();
    expect(screen.getByText('almond.slidetr.net')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /Delete 1 file/i }));

    await vi.waitFor(() =>
      expect(deleteBlob).toHaveBeenCalledWith('https://almond.slidetr.net', hashA, expect.anything())
    );
    await vi.waitFor(() => expect(screen.getByText(/1 deleted, 0 already gone, 0 failed/i)).toBeTruthy());
    expect(recordBlobsRemoved).toHaveBeenCalledWith('pk', [{ sha256: hashA, serverUrl: 'https://almond.slidetr.net' }]);
  });

  it('completes a 700-file delete run', async () => {
    const hashFor = (assetId: string) => Number(assetId.slice(6)).toString(16).padStart(64, '0');
    planCatalogAction.mockImplementation(async (_pubkey: string, assetId: string) => ({
      allowed: true,
      targets: [hashFor(assetId)],
    }));
    getAssetReplicaMap.mockImplementation(async (_pubkey: string, assetId: string) => {
      const hash = hashFor(assetId);
      return [
        {
          sha256: hash,
          assetId,
          role: 'main',
          size: 10,
          sources: [{ serverId: 'https://media.example', baseUrl: 'https://media.example', serverType: 'blossom' }],
          presentOn: ['https://media.example'],
          absentFrom: [],
        },
      ];
    });
    recordBlobsRemoved.mockResolvedValue(undefined);
    createDeleteAuth.mockResolvedValue({ id: 'auth-event' });
    deleteBlob.mockResolvedValue(true);

    renderDialog(Array.from({ length: 700 }, (_, index) => item(`asset-${index}`)));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: /Delete 700 files/i })).toBeTruthy(), {
      timeout: 10_000,
    });
    await userEvent.click(screen.getByRole('button', { name: /Delete 700 files/i }));
    await vi.waitFor(() => expect(screen.getByText(/700 deleted, 0 already gone, 0 failed/i)).toBeTruthy(), {
      timeout: 30_000,
    });
    expect(deleteBlob).toHaveBeenCalledTimes(700);
  });
});
