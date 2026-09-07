/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const { mockRelayPoolPublish, mockAccountManager } = vi.hoisted(() => ({
  mockRelayPoolPublish: vi.fn(),
  mockAccountManager: { active: undefined as unknown },
}));
vi.mock('../../nostr/core', () => ({
  relayPool: { publish: (...args: unknown[]) => mockRelayPoolPublish(...args) },
  mergeRelays: (userRelays: string[] = []) => userRelays,
}));
vi.mock('../../utils/nostr', () => ({
  accountManager: mockAccountManager,
  useNostr: () => ({ user: { pubkey: 'p'.repeat(64), relayUrls: [] } }),
}));
vi.mock('../../utils/useEvents', () => ({ default: () => ({ events: [] }) }));

import useVideoThumbnailDvm from './dvm';
import type { FileEventData } from './FileEventEditor';

const fileEventData = { url: ['https://server.example/a.mp4'] } as FileEventData;

const signedTemplate = (template: { kind: number }) =>
  Promise.resolve({ ...template, id: 'e'.repeat(64), sig: 's'.repeat(128) });

beforeEach(() => {
  mockRelayPoolPublish.mockReset();
  mockAccountManager.active = undefined;
  vi.unstubAllEnvs();
});

describe('useVideoThumbnailDvm.createDvmThumbnailRequest', () => {
  it('never reaches the relay pool while publishing is disabled', async () => {
    vi.stubEnv('VITE_DISABLE_EVENT_PUBLISH', '1');
    mockAccountManager.active = {
      signer: { signEvent: vi.fn(signedTemplate), nip04: { encrypt: vi.fn().mockResolvedValue('cipher') } },
    };

    const { result } = renderHook(() => useVideoThumbnailDvm(fileEventData, () => {}));
    await result.current.createDvmThumbnailRequest(fileEventData);

    expect(mockRelayPoolPublish).not.toHaveBeenCalled();
  });

  it('silently no-ops for a read-only account instead of throwing', async () => {
    mockAccountManager.active = undefined;

    const { result } = renderHook(() => useVideoThumbnailDvm(fileEventData, () => {}));
    await expect(result.current.createDvmThumbnailRequest(fileEventData)).resolves.toBeUndefined();

    expect(mockRelayPoolPublish).not.toHaveBeenCalled();
  });

  it('encrypts, signs, and publishes the request when a signer is active', async () => {
    mockAccountManager.active = {
      signer: { signEvent: vi.fn(signedTemplate), nip04: { encrypt: vi.fn().mockResolvedValue('cipher') } },
    };
    mockRelayPoolPublish.mockResolvedValue([{ from: 'wss://relay.example', ok: true }]);

    const { result } = renderHook(() => useVideoThumbnailDvm(fileEventData, () => {}));
    await result.current.createDvmThumbnailRequest(fileEventData);

    expect(mockRelayPoolPublish).toHaveBeenCalledOnce();
  });
});
