/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import TimelineAssetDetail from './TimelineAssetDetail';
import type { TimelineAssetDetail as TimelineAssetDetailType } from '../catalog/catalog';

const mockGetCatalogTimelineAsset = vi.fn();
const mockIngestAuthoredEvents = vi.fn().mockResolvedValue(undefined);
const mockNavigate = vi.fn();

const mockDialogDeleted = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/nostr/core', () => ({
  relayPool: { publish: vi.fn() },
  mergeRelays: (userRelays: string[] = []) => userRelays,
  eventStore: { timeline: () => ({ pipe: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }) }) },
}));

vi.mock('../utils/useUserServers', () => ({
  useUserServers: () => ({ servers: [], storeUserServers: vi.fn() }),
}));

vi.mock('../utils/nostr', () => ({
  useNostr: () => ({
    user: { pubkey: 'p'.repeat(64), relayUrls: ['wss://relay.example'] },
    signEventTemplate: vi.fn(),
  }),
}));

const mockUseServerInfo = vi.fn(() => ({ distribution: {}, serverInfo: {} }));
vi.mock('../utils/useServerInfo', () => ({
  useServerInfo: () => mockUseServerInfo(),
}));

const mockDispatch = vi.fn();
vi.mock('../GlobalState', () => ({
  useGlobalContext: () => ({ state: {}, dispatch: mockDispatch }),
}));

vi.mock('../catalog/catalogClient', () => ({
  getCatalogClient: () => ({
    getCatalogTimelineAsset: (...args: unknown[]) => mockGetCatalogTimelineAsset(...args),
    ingestAuthoredEvents: (...args: unknown[]) => mockIngestAuthoredEvents(...args),
    refreshReplicaAvailability: vi.fn().mockResolvedValue(undefined),
    refreshEventUrlAvailability: vi.fn().mockResolvedValue(undefined),
  }),
}));

let lastDialogProps: { action: string; assets: unknown[] } | undefined;
vi.mock('../components/Browse/BrowseActionPlanDialog', () => ({
  BrowseActionPlanDialog: (props: {
    action: string;
    assets: unknown[];
    onClose: () => void;
    onDeleted: () => void;
  }) => {
    lastDialogProps = { action: props.action, assets: props.assets };
    return (
      <div role="dialog" aria-label={`${props.action} plan`}>
        <button onClick={props.onClose}>Close plan</button>
        <button
          onClick={() => {
            mockDialogDeleted();
            props.onDeleted();
          }}
        >
          Finish plan
        </button>
      </div>
    );
  },
}));

let describeProps:
  | { open: boolean; initialData: { x: string; url: string[]; m?: string; size: number }; onOpenChange: (open: boolean) => void; onPublished: (event: Record<string, unknown>) => Promise<void> }
  | undefined;
vi.mock('../components/Browse/DescribeUnlinkedFileDialog', () => ({
  DescribeUnlinkedFileDialog: (props: NonNullable<typeof describeProps>) => {
    describeProps = props;
    return props.open ? (
      <div role="dialog" aria-label="Describe and publish file">
        <button onClick={() => props.onOpenChange(false)}>Cancel describing</button>
        <button onClick={() => void props.onPublished({ id: 'published-event' })}>Publish mocked metadata</button>
      </div>
    ) : null;
  },
}));

const projection: TimelineAssetDetailType['projection'] = {
  id: 'evt1',
  pubkey: 'p'.repeat(64),
  assetId: 'asset-1',
  displayType: 'video',
  displayTitle: 'Unlinked video',
  displayTitleIsFallback: true,
  displayKindLabel: 'MP4 video',
  searchText: 'unlinked video',
  displayDate: Date.now(),
  displayDateSource: 'first-seen',
  primaryBlobSha256: 'a'.repeat(64),
  blobCount: 1,
  totalBlobSize: 100,
  unknownBlobSizeCount: 0,
  replicaCount: 1,
  availabilityState: 'complete',
  metadataCompleteness: 'complete',
  projectedAt: Date.now(),
};

const detailFixture: TimelineAssetDetailType = {
  projection,
  blobs: [
    {
      sha256: 'a'.repeat(64),
      role: 'primary',
      ordinal: 0,
      urls: ['https://server.example/a'],
      replicaCount: 1,
      availabilityState: 'complete',
    },
  ],
  event: undefined,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockUseServerInfo.mockReturnValue({ distribution: {}, serverInfo: {} });
  lastDialogProps = undefined;
  describeProps = undefined;
});

const renderDetail = () =>
  render(
    <MemoryRouter initialEntries={['/browse/asset-1']}>
      <Routes>
        <Route path="/browse/:assetId" element={<TimelineAssetDetail />} />
      </Routes>
    </MemoryRouter>
  );

describe('TimelineAssetDetail storage actions', () => {
  it('offers mirror/sync/delete for an unlinked item and opens the shared action plan dialog', async () => {
    const user = userEvent.setup();
    mockGetCatalogTimelineAsset.mockResolvedValue(detailFixture);

    renderDetail();

    const menuButton = await screen.findByRole('button', { name: /open (item )?actions/i });
    await user.click(menuButton);
    await user.click(screen.getByRole('menuitem', { name: /mirror/i }));

    expect(await screen.findByRole('dialog', { name: /mirror plan/i })).toBeTruthy();
    expect(lastDialogProps?.action).toBe('mirror');
    expect(lastDialogProps?.assets).toEqual([projection]);
  });

  it('navigates back to Browse after a delete action completes', async () => {
    const user = userEvent.setup();
    mockGetCatalogTimelineAsset.mockResolvedValue(detailFixture);

    renderDetail();

    const menuButton = await screen.findByRole('button', { name: /open (item )?actions/i });
    await user.click(menuButton);
    await user.click(screen.getByRole('menuitem', { name: /delete/i }));

    await user.click(await screen.findByRole('button', { name: /finish plan/i }));

    expect(mockDialogDeleted).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith('/browse');
  });
});

const HASH = 'a'.repeat(64);

const serverInfoFixture = (over: Partial<import('../utils/useServerInfo').ServerInfo>) => ({
  name: 'server.example',
  url: 'https://server.example',
  type: 'blossom' as const,
  virtual: false,
  isLoading: false,
  isError: false,
  count: 0,
  size: 0,
  lastChange: 0,
  features: {},
  ...over,
});

describe('TimelineAssetDetail server copies', () => {
  it('breaks down copy presence per configured server by human-readable name, without collapsing states', async () => {
    mockUseServerInfo.mockReturnValue({
      distribution: {},
      serverInfo: {
        'has-it.example': serverInfoFixture({
          name: 'has-it.example',
          url: 'https://has-it.example',
          blobs: [{ sha256: HASH, url: `https://has-it.example/${HASH}`, size: 100, uploaded: 0 }],
        }),
        'missing-it.example': serverInfoFixture({
          name: 'missing-it.example',
          url: 'https://missing-it.example',
          blobs: [],
        }),
        'loading.example': serverInfoFixture({
          name: 'loading.example',
          url: 'https://loading.example',
          isLoading: true,
        }),
        'down.example': serverInfoFixture({ name: 'down.example', url: 'https://down.example', isError: true }),
      },
    });
    mockGetCatalogTimelineAsset.mockResolvedValue({
      ...detailFixture,
      blobs: [
        {
          ...detailFixture.blobs[0],
          urls: [`https://has-it.example/${HASH}`],
        },
      ],
    });

    renderDetail();

    expect(await screen.findByText('has-it.example')).toBeTruthy();
    expect(screen.getByText('missing-it.example')).toBeTruthy();
    expect(screen.getByText('loading.example')).toBeTruthy();
    expect(screen.getByText('down.example')).toBeTruthy();
    expect(screen.getByText(/confirmed missing/i)).toBeTruthy();
    expect(screen.getByText(/not checked/i)).toBeTruthy();
    expect(screen.getByText(/unreachable/i)).toBeTruthy();
    // The confirmed server's real listed URL is shown as a working link, not an invented one.
    const link = screen.getByRole('link', { name: /has-it\.example/i });
    expect(link.getAttribute('href')).toBe(`https://has-it.example/${HASH}`);
  });

  it('separates event-tag URLs from confirmed server copies when their counts differ', async () => {
    mockUseServerInfo.mockReturnValue({
      distribution: {},
      serverInfo: {
        'has-it.example': serverInfoFixture({
          name: 'has-it.example',
          url: 'https://has-it.example',
          blobs: [{ sha256: HASH, url: `https://has-it.example/${HASH}`, size: 100, uploaded: 0 }],
        }),
      },
    });
    mockGetCatalogTimelineAsset.mockResolvedValue({
      ...detailFixture,
      blobs: [
        {
          ...detailFixture.blobs[0],
          urls: [
            `https://has-it.example/${HASH}`,
            'https://relay-host.example/a.mp4',
            'https://another-relay.example/a.mp4',
          ],
        },
      ],
    });

    renderDetail();

    expect(await screen.findByText('has-it.example')).toBeTruthy();
    const eventUrlsHeading = screen.getByText(/from event metadata/i);
    expect(eventUrlsHeading).toBeTruthy();
    expect(screen.getByRole('link', { name: /relay-host\.example/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /another-relay\.example/i })).toBeTruthy();
    // The confirmed-server list must not also list the two event URLs as servers.
    expect(screen.queryByText('relay-host.example')).toBeFalsy();
  });
});

describe('TimelineAssetDetail media preview', () => {
  it('shows the real image at a prominent size instead of a small thumbnail', async () => {
    mockGetCatalogTimelineAsset.mockResolvedValue({
      ...detailFixture,
      projection: { ...projection, displayType: 'image', primaryUrl: 'https://has-it.example/a.jpg' },
    });

    renderDetail();

    const img = await screen.findByRole('img', { name: /unlinked video/i });
    expect(img.getAttribute('src')).toBe('https://has-it.example/a.jpg');
  });

  it('plays audio through the global player when Play is clicked', async () => {
    const user = userEvent.setup();
    mockGetCatalogTimelineAsset.mockResolvedValue({
      ...detailFixture,
      projection: { ...projection, displayType: 'audio', primaryUrl: 'https://has-it.example/a.mp3' },
    });

    renderDetail();

    await user.click(await screen.findByRole('button', { name: /play/i }));

    expect(mockDispatch).toHaveBeenCalledWith({
      type: 'SET_CURRENT_SONG',
      song: { url: 'https://has-it.example/a.mp3' },
    });
  });

  it('plays supported video inline with native controls', async () => {
    mockGetCatalogTimelineAsset.mockResolvedValue({
      ...detailFixture,
      projection: { ...projection, displayType: 'video', primaryUrl: 'https://has-it.example/a.mp4' },
    });

    renderDetail();
    await screen.findByText('Unlinked video');

    const video = document.querySelector('video');
    expect(video?.getAttribute('src')).toBe('https://has-it.example/a.mp4');
    expect(video?.hasAttribute('controls')).toBe(true);
  });

  it('shows an unavailable state instead of a loading spinner when no media url exists', async () => {
    mockGetCatalogTimelineAsset.mockResolvedValue({
      ...detailFixture,
      projection: { ...projection, displayType: 'video', primaryUrl: undefined },
    });

    renderDetail();

    expect(await screen.findByText(/media unavailable/i)).toBeTruthy();
    expect(document.querySelector('video')).toBeFalsy();
  });
});

describe('TimelineAssetDetail describe unlinked file', () => {
  it('initializes known catalog metadata and ingests the delivered event', async () => {
    const user = userEvent.setup();
    mockGetCatalogTimelineAsset.mockResolvedValue({
      ...detailFixture,
      projection: { ...projection, displayMimeType: 'video/mp4', primaryUrl: 'https://server.example/a.mp4' },
      blobs: [{ ...detailFixture.blobs[0], mimeType: 'video/mp4', size: 42, urls: ['https://server.example/a.mp4'] }],
    });

    renderDetail();
    await user.click(await screen.findByRole('button', { name: /describe and publish/i }));

    expect(describeProps?.initialData).toMatchObject({
      x: 'a'.repeat(64),
      url: ['https://server.example/a.mp4'],
      m: 'video/mp4',
      size: 42,
    });
    await user.click(screen.getByRole('button', { name: /publish mocked metadata/i }));

    expect(mockIngestAuthoredEvents).toHaveBeenCalledWith(
      'p'.repeat(64),
      [{ id: 'published-event' }],
      'wss://relay.example'
    );
  });

  it('cancels describing an unlinked file without ingesting an event', async () => {
    const user = userEvent.setup();
    mockGetCatalogTimelineAsset.mockResolvedValue(detailFixture);

    renderDetail();
    await user.click(await screen.findByRole('button', { name: /describe and publish/i }));
    await user.click(screen.getByRole('button', { name: /cancel describing/i }));

    expect(mockIngestAuthoredEvents).not.toHaveBeenCalled();
  });
});
