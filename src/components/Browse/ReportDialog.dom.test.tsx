/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const { publish, report } = vi.hoisted(() => ({ publish: vi.fn(), report: vi.fn() }));
import { ReportDialog } from './ReportDialog';

vi.mock('../../utils/nostr', () => ({
  useNostr: () => ({ user: { relayUrls: ['wss://relay.example'] } }),
}));
vi.mock('../../utils/useUserServers', () => ({
  useUserServers: () => ({
    servers: [
      { type: 'blossom', name: 'one', url: 'https://one.example' },
      { type: 'blossom', name: 'two', url: 'https://two.example' },
      { type: 'nip96', name: 'nip', url: 'https://nip.example' },
    ],
    serversLoading: false,
    storeUserServers: async () => {},
  }),
}));
vi.mock('@/nostr/core', () => ({
  relayPool: { publish },
  mergeRelays: (userRelays: string[]) => userRelays,
}));
vi.mock('../../utils/server', () => ({
  mediaServer: (server: { url: string }) => ({ report: (event: unknown) => report(server.url, event) }),
}));

afterEach(() => {
  cleanup();
  publish.mockReset();
  report.mockReset();
});

const sign = async (template: unknown) => template as never;

describe('ReportDialog', () => {
  it('sends one signed event to relays and every blossom server, never to nip96', async () => {
    publish.mockResolvedValue(undefined);
    report.mockResolvedValue(undefined);
    render(
      <ReportDialog
        open
        onOpenChange={() => {}}
        hashes={['a'.repeat(64)]}
        event={{ id: 'evt', pubkey: 'pk' }}
        signEventTemplate={sign}
      />
    );

    await userEvent.click(screen.getByRole('button', { name: /send report/i }));

    expect(publish).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledTimes(2);
    expect(report.mock.calls.map(call => call[0]).sort()).toEqual(['https://one.example', 'https://two.example']);
    const event = report.mock.calls[0][1] as { kind: number; tags: string[][] };
    expect(event.kind).toBe(1984);
    expect(event.tags).toEqual(expect.arrayContaining([['x', 'a'.repeat(64), 'other'], ['e', 'evt'], ['p', 'pk']]));
  });

  it('still publishes to relays when a server rejects the report', async () => {
    publish.mockResolvedValue(undefined);
    report.mockRejectedValue(new Error('502'));
    render(<ReportDialog open onOpenChange={() => {}} hashes={['a'.repeat(64)]} signEventTemplate={sign} />);

    await userEvent.click(screen.getByRole('button', { name: /send report/i }));

    expect(publish).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledTimes(2);
  });
});
