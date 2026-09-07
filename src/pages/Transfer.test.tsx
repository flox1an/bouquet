/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Transfer } from './Transfer';
import type { ServerInfo } from '../utils/useServerInfo';

let currentServerInfo: Record<string, ServerInfo> = {};

vi.mock('../utils/useServerInfo', () => ({
  useServerInfo: () => ({
    serverInfo: currentServerInfo,
    distribution: {},
    setMirrorSupported: vi.fn(),
    rescan: vi.fn(),
  }),
}));

vi.mock('@/nostr/core', () => ({
  relayPool: { publish: vi.fn() },
  mergeRelays: (userRelays: string[] = []) => userRelays,
}));

vi.mock('../utils/useUserServers', () => ({
  useUserServers: () => ({
    servers: Object.values(currentServerInfo),
    storeUserServers: vi.fn(),
  }),
}));

const mockTransferBlob = vi.fn();
vi.mock('../utils/transfer', () => ({
  transferBlob: (...args: unknown[]) => mockTransferBlob(...args),
}));

vi.mock('../utils/nostr', () => ({
  useNostr: () => ({
    user: { pubkey: 'test-pubkey' },
    signEventTemplate: vi.fn(),
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('../components/BlobList/BlobList', () => ({
  default: () => null,
}));

const baseServer = (overrides: Partial<ServerInfo>): ServerInfo => ({
  name: 'server',
  url: 'https://server.example',
  type: 'blossom',
  virtual: false,
  count: 0,
  size: 0,
  lastChange: 0,
  isLoading: false,
  isError: false,
  blobs: [],
  features: {},
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  currentServerInfo = {};
});

describe('Transfer inventory status', () => {
  it('shows a loading state instead of "no missing files" while source inventory is still loading', async () => {
    const user = userEvent.setup();
    currentServerInfo = {
      alpha: baseServer({ name: 'alpha', isLoading: true, blobs: undefined }),
      beta: baseServer({ name: 'beta', blobs: [] }),
    };

    render(
      <MemoryRouter>
        <Transfer />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: /choose a source server/i }));
    await user.click(screen.getByRole('menuitemradio', { name: /alpha/i }));

    await user.click(screen.getByRole('button', { name: /select target server/i }));
    await user.click(screen.getByRole('menuitemradio', { name: /beta/i }));

    expect(screen.queryByText(/no missing files to transfer/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /start sync/i })).toBeNull();
    expect(screen.getByText(/checking file inventory/i)).toBeTruthy();
  });

  it('shows an error state instead of "no missing files" when a server listing fails to load', async () => {
    const user = userEvent.setup();
    currentServerInfo = {
      alpha: baseServer({ name: 'alpha', blobs: [] }),
      beta: baseServer({ name: 'beta', isLoading: true, blobs: undefined }),
    };

    const { rerender } = render(
      <MemoryRouter>
        <Transfer />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: /choose a source server/i }));
    await user.click(screen.getByRole('menuitemradio', { name: /alpha/i }));

    await user.click(screen.getByRole('button', { name: /select target server/i }));
    await user.click(screen.getByRole('menuitemradio', { name: /beta/i }));

    // The target's listing now fails after being selected while still loading.
    currentServerInfo = {
      ...currentServerInfo,
      beta: baseServer({ name: 'beta', isLoading: false, isError: true, blobs: undefined }),
    };
    rerender(
      <MemoryRouter>
        <Transfer />
      </MemoryRouter>
    );

    expect(screen.queryByText(/no missing files to transfer/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /start sync/i })).toBeNull();
    expect(screen.getByText(/could not read this server's file list/i)).toBeTruthy();
  });
});

describe('Transfer cancellation recovery', () => {
  it('preserves a completed transfer and lets the user resume a task cancelled before it started', async () => {
    const user = userEvent.setup();
    const blobA = { sha256: 'a'.repeat(64), size: 10, type: 'image/jpeg', uploaded: 1, url: 'https://source.example/a' };
    const blobB = { sha256: 'b'.repeat(64), size: 10, type: 'image/jpeg', uploaded: 1, url: 'https://source.example/b' };
    currentServerInfo = {
      source: baseServer({ name: 'source', blobs: [blobA, blobB] }),
      target: baseServer({ name: 'target', blobs: [] }),
    };

    const { promise: blobAPromise, resolve: resolveBlobA } = Promise.withResolvers<typeof blobA>();
    mockTransferBlob.mockImplementationOnce(() => blobAPromise);
    mockTransferBlob.mockImplementationOnce(() => new Promise(() => {}));

    render(
      <MemoryRouter>
        <Transfer />
      </MemoryRouter>
    );

    await user.click(screen.getByRole('button', { name: /choose a source server/i }));
    await user.click(screen.getByRole('menuitemradio', { name: /^source/i }));
    await user.click(screen.getByRole('button', { name: /select target server/i }));
    await user.click(screen.getByRole('menuitemradio', { name: /^target/i }));

    await user.click(screen.getByRole('button', { name: /start sync/i }));

    const cancelButton = await screen.findByRole('button', { name: /^cancel$/i });
    await user.click(cancelButton);

    // blobA's underlying transfer still completes after cancellation was requested;
    // blobB never got a chance to start because concurrency is 1.
    resolveBlobA(blobA);

    // Completed work must remain visible, and the unstarted task must become resumable.
    const resumeButton = await screen.findByRole('button', { name: /resume/i });
    expect(screen.getByText('Completed').parentElement?.textContent).toContain('1'); // blobA preserved

    mockTransferBlob.mockClear();
    mockTransferBlob.mockResolvedValueOnce(blobB);

    await user.click(resumeButton);

    expect(mockTransferBlob).toHaveBeenCalledTimes(1);
    expect(mockTransferBlob).toHaveBeenCalledWith(
      expect.stringContaining(blobB.sha256),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });
});
