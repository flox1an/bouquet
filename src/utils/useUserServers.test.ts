/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';

const { mockRelayPoolPublish, mockAccountManager } = vi.hoisted(() => ({
  mockRelayPoolPublish: vi.fn(),
  mockAccountManager: { active: undefined as unknown },
}));
vi.mock('../nostr/core', () => ({
  relayPool: { publish: (...args: unknown[]) => mockRelayPoolPublish(...args) },
  mergeRelays: (userRelays: string[] = []) => userRelays,
}));
vi.mock('./nostr', () => ({
  accountManager: mockAccountManager,
  useNostr: () => ({
    user: { npub: 'npub1424242424242424242424242424242424242424242424242424qamrcaj', relayUrls: [] },
  }),
}));
vi.mock('./useEvent', () => ({ default: () => ({ isSuccess: false, isLoading: false, data: undefined }) }));
vi.mock('./nip96', () => ({ fetchNip96ServerConfig: vi.fn() }));

import { useUserServers } from './useUserServers';

const signedTemplate = (template: { kind: number }) =>
  Promise.resolve({ ...template, id: 'e'.repeat(64), sig: 's'.repeat(128) });

const renderStoreHook = () => {
  const client = new QueryClient();
  return renderHook(() => useUserServers(), {
    wrapper: ({ children }) => createElement(QueryClientProvider, { client }, children),
  });
};

beforeEach(() => {
  mockRelayPoolPublish.mockReset();
  vi.unstubAllEnvs();
});

describe('useUserServers.storeUserServers', () => {
  it('never reaches the relay pool while publishing is disabled', async () => {
    vi.stubEnv('VITE_DISABLE_EVENT_PUBLISH', '1');
    mockAccountManager.active = { signer: { signEvent: vi.fn(signedTemplate) } };

    const { result } = renderStoreHook();
    const outcome = await result.current.storeUserServers([
      { type: 'blossom', name: 'a.example', url: 'https://a.example' },
    ]);

    expect(mockRelayPoolPublish).not.toHaveBeenCalled();
    expect(outcome.blossom.verdict).toBe('disabled');
    expect(outcome.nip96.verdict).toBe('disabled');
  });

  it('publishes one event per server type and reports success independently', async () => {
    mockAccountManager.active = { signer: { signEvent: vi.fn(signedTemplate) } };
    mockRelayPoolPublish.mockResolvedValue([{ from: 'wss://relay.example', ok: true }]);

    const { result } = renderStoreHook();
    const outcome = await result.current.storeUserServers([
      { type: 'blossom', name: 'a.example', url: 'https://a.example' },
      { type: 'nip96', name: 'b.example', url: 'https://b.example' },
    ]);

    expect(mockRelayPoolPublish).toHaveBeenCalledTimes(2);
    expect(outcome.blossom.verdict).toBe('delivered');
    expect(outcome.nip96.verdict).toBe('delivered');
  });

  it('reports one list failing while the other succeeds', async () => {
    mockAccountManager.active = { signer: { signEvent: vi.fn(signedTemplate) } };
    mockRelayPoolPublish.mockImplementation((_relays: string[], event: { kind: number }) =>
      Promise.resolve(
        event.kind === 10096
          ? [{ from: 'wss://relay.example', ok: false, message: 'rejected' }]
          : [{ from: 'wss://relay.example', ok: true }]
      )
    );

    const { result } = renderStoreHook();
    const outcome = await result.current.storeUserServers([
      { type: 'blossom', name: 'a.example', url: 'https://a.example' },
      { type: 'nip96', name: 'b.example', url: 'https://b.example' },
    ]);

    expect(outcome.blossom.verdict).toBe('delivered');
    expect(outcome.nip96.verdict).toBe('failed');
  });
});
