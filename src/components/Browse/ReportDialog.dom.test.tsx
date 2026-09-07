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
    publish.mockResolvedValue([{ from: 'wss://relay.example', ok: true }]);
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
    publish.mockResolvedValue([{ from: 'wss://relay.example', ok: true }]);
    report.mockRejectedValue(new Error('502'));
    render(<ReportDialog open onOpenChange={() => {}} hashes={['a'.repeat(64)]} signEventTemplate={sign} />);

    await userEvent.click(screen.getByRole('button', { name: /send report/i }));

    expect(publish).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledTimes(2);
  });

  it('closes automatically once every destination accepts', async () => {
    publish.mockResolvedValue([{ from: 'wss://relay.example', ok: true }]);
    report.mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(
      <ReportDialog open onOpenChange={onOpenChange} hashes={['a'.repeat(64)]} signEventTemplate={sign} />
    );

    await userEvent.click(screen.getByRole('button', { name: /send report/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the dialog open and lists the failed server distinctly when one server rejects', async () => {
    publish.mockResolvedValue([{ from: 'wss://relay.example', ok: true }]);
    report.mockImplementation((url: string) =>
      url === 'https://one.example' ? Promise.resolve(undefined) : Promise.reject(new Error('502 bad gateway'))
    );
    const onOpenChange = vi.fn();
    render(
      <ReportDialog open onOpenChange={onOpenChange} hashes={['a'.repeat(64)]} signEventTemplate={sign} />
    );

    await userEvent.click(screen.getByRole('button', { name: /send report/i }));

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(await screen.findByText(/502 bad gateway/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /retry failed/i })).toBeTruthy();
  });

  it('retrying only re-sends to the destination that failed, not the one that already succeeded', async () => {
    publish.mockResolvedValue([{ from: 'wss://relay.example', ok: true }]);
    report.mockImplementation((url: string) =>
      url === 'https://one.example' ? Promise.resolve(undefined) : Promise.reject(new Error('502'))
    );
    render(<ReportDialog open onOpenChange={() => {}} hashes={['a'.repeat(64)]} signEventTemplate={sign} />);

    await userEvent.click(screen.getByRole('button', { name: /send report/i }));
    await screen.findByRole('button', { name: /retry failed/i });
    report.mockClear();
    report.mockResolvedValue(undefined);

    await userEvent.click(screen.getByRole('button', { name: /retry failed/i }));

    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0]).toBe('https://two.example');
  });

  it('shows disabled relay delivery distinctly from a real failure and still closes once servers accept', async () => {
    vi.stubEnv('VITE_DISABLE_EVENT_PUBLISH', '1');
    report.mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    render(
      <ReportDialog open onOpenChange={onOpenChange} hashes={['a'.repeat(64)]} signEventTemplate={sign} />
    );

    await userEvent.click(screen.getByRole('button', { name: /send report/i }));

    expect(publish).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    vi.unstubAllEnvs();
  });

  it('reports complete failure across every destination without closing the dialog', async () => {
    publish.mockResolvedValue([{ from: 'wss://relay.example', ok: false, message: 'down' }]);
    report.mockRejectedValue(new Error('502'));
    const onOpenChange = vi.fn();
    render(
      <ReportDialog open onOpenChange={onOpenChange} hashes={['a'.repeat(64)]} signEventTemplate={sign} />
    );

    await userEvent.click(screen.getByRole('button', { name: /send report/i }));

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /retry failed/i })).toBeTruthy();
    expect(screen.getAllByText(/failed/i).length).toBeGreaterThan(0);
  });
});
