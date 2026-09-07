import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NostrEvent } from 'nostr-tools';
import { ReadonlyAccount } from 'applesauce-accounts/accounts';

const { mockRelayPoolPublish, mockAccountManager } = vi.hoisted(() => ({
  mockRelayPoolPublish: vi.fn(),
  mockAccountManager: { active: undefined as unknown },
}));
vi.mock('../nostr/core', () => ({
  relayPool: { publish: (...args: unknown[]) => mockRelayPoolPublish(...args) },
}));

vi.mock('./nostr', () => ({
  accountManager: mockAccountManager,
}));

import { publishToRelays, signAndPublish, retryFailedTargets, ReadOnlyAccountError } from './publish';

const template = { kind: 1, created_at: 0, content: 'hi', tags: [], pubkey: 'p'.repeat(64) };
const signedEvent: NostrEvent = { ...template, id: 'e'.repeat(64), sig: 's'.repeat(128) };

beforeEach(() => {
  mockAccountManager.active = undefined;
  mockRelayPoolPublish.mockReset();
  vi.unstubAllEnvs();
});

describe('publishToRelays', () => {
  it('reports every destination as accepted when all relays ack', async () => {
    mockRelayPoolPublish.mockResolvedValue([
      { from: 'wss://a.example', ok: true },
      { from: 'wss://b.example', ok: true },
    ]);

    const result = await publishToRelays(['wss://a.example', 'wss://b.example'], signedEvent);

    expect(result.verdict).toBe('delivered');
    expect(result.event).toBe(signedEvent);
    expect(result.targets).toEqual([
      { url: 'wss://a.example', ok: true, message: undefined },
      { url: 'wss://b.example', ok: true, message: undefined },
    ]);
  });

  it('reports partial delivery when some relays reject', async () => {
    mockRelayPoolPublish.mockResolvedValue([
      { from: 'wss://a.example', ok: true },
      { from: 'wss://b.example', ok: false, message: 'blocked: spam' },
    ]);

    const result = await publishToRelays(['wss://a.example', 'wss://b.example'], signedEvent);

    expect(result.verdict).toBe('partial');
    expect(result.targets[1]).toEqual({ url: 'wss://b.example', ok: false, message: 'blocked: spam' });
  });

  it('reports complete failure when every relay rejects', async () => {
    mockRelayPoolPublish.mockResolvedValue([{ from: 'wss://a.example', ok: false, message: 'rate-limited' }]);

    const result = await publishToRelays(['wss://a.example'], signedEvent);

    expect(result.verdict).toBe('failed');
  });

  it('skips the relay pool entirely when publishing is disabled by the flag', async () => {
    vi.stubEnv('VITE_DISABLE_EVENT_PUBLISH', '1');

    const result = await publishToRelays(['wss://a.example'], signedEvent);

    expect(result).toEqual({ event: signedEvent, verdict: 'disabled', targets: [] });
    expect(mockRelayPoolPublish).not.toHaveBeenCalled();
  });

  it('retrying with only the failed destinations dispatches to just those relays, reusing the same event', async () => {
    mockRelayPoolPublish.mockResolvedValue([{ from: 'wss://b.example', ok: true }]);

    const retryResult = await publishToRelays(['wss://b.example'], signedEvent);

    expect(mockRelayPoolPublish).toHaveBeenCalledWith(['wss://b.example'], signedEvent);
    expect(retryResult.event).toBe(signedEvent);
    expect(retryResult.verdict).toBe('delivered');
  });
});

describe('signAndPublish', () => {
  it('throws ReadOnlyAccountError without publishing when no signer is active', async () => {
    mockAccountManager.active = undefined;

    await expect(signAndPublish(template, ['wss://a.example'])).rejects.toBeInstanceOf(ReadOnlyAccountError);
    expect(mockRelayPoolPublish).not.toHaveBeenCalled();
  });

  it('throws ReadOnlyAccountError without publishing for a read-only account', async () => {
    mockAccountManager.active = ReadonlyAccount.fromPubkey('a'.repeat(64));

    await expect(signAndPublish(template, ['wss://a.example'])).rejects.toBeInstanceOf(ReadOnlyAccountError);
    expect(mockRelayPoolPublish).not.toHaveBeenCalled();
  });

  it('signs then publishes through the same shared path, honouring the disable flag', async () => {
    mockAccountManager.active = { signer: { signEvent: vi.fn().mockResolvedValue(signedEvent) } };
    vi.stubEnv('VITE_DISABLE_EVENT_PUBLISH', '1');

    const result = await signAndPublish(template, ['wss://a.example']);

    expect(result.verdict).toBe('disabled');
    expect(mockRelayPoolPublish).not.toHaveBeenCalled();
  });

  it('signs and delivers to relays when publishing is enabled', async () => {
    const signEvent = vi.fn().mockResolvedValue(signedEvent);
    mockAccountManager.active = { signer: { signEvent } };
    mockRelayPoolPublish.mockResolvedValue([{ from: 'wss://a.example', ok: true }]);

    const result = await signAndPublish(template, ['wss://a.example']);

    expect(signEvent).toHaveBeenCalledWith(template);
    expect(result.verdict).toBe('delivered');
    expect(result.event).toBe(signedEvent);
  });
});

describe('retryFailedTargets', () => {
  it('dispatches only to previously-failed relays and merges the result, keeping the same event', async () => {
    const previous = {
      event: signedEvent,
      verdict: 'partial' as const,
      targets: [
        { url: 'wss://a.example', ok: true, message: undefined },
        { url: 'wss://b.example', ok: false, message: 'timeout' },
      ],
    };
    mockRelayPoolPublish.mockResolvedValue([{ from: 'wss://b.example', ok: true }]);

    const updated = await retryFailedTargets(previous);

    expect(mockRelayPoolPublish).toHaveBeenCalledWith(['wss://b.example'], signedEvent);
    expect(updated.event).toBe(signedEvent);
    expect(updated.verdict).toBe('delivered');
    expect(updated.targets).toEqual([
      { url: 'wss://a.example', ok: true, message: undefined },
      { url: 'wss://b.example', ok: true, message: undefined },
    ]);
  });

  it('is a no-op when nothing failed', async () => {
    const previous = {
      event: signedEvent,
      verdict: 'delivered' as const,
      targets: [{ url: 'wss://a.example', ok: true, message: undefined }],
    };

    const updated = await retryFailedTargets(previous);

    expect(updated).toBe(previous);
    expect(mockRelayPoolPublish).not.toHaveBeenCalled();
  });

  it('still reports remaining failures after a retry that only partly succeeds', async () => {
    const previous = {
      event: signedEvent,
      verdict: 'failed' as const,
      targets: [
        { url: 'wss://a.example', ok: false, message: 'down' },
        { url: 'wss://b.example', ok: false, message: 'down' },
      ],
    };
    mockRelayPoolPublish.mockResolvedValue([
      { from: 'wss://a.example', ok: true },
      { from: 'wss://b.example', ok: false, message: 'still down' },
    ]);

    const updated = await retryFailedTargets(previous);

    expect(updated.verdict).toBe('partial');
    expect(updated.targets).toEqual([
      { url: 'wss://a.example', ok: true, message: undefined },
      { url: 'wss://b.example', ok: false, message: 'still down' },
    ]);
  });
});
