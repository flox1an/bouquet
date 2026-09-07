/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { retryFailedTargets } = vi.hoisted(() => ({ retryFailedTargets: vi.fn() }));
vi.mock('../../utils/publish', () => ({ retryFailedTargets }));

import ServerListPopup from './index';

const event = { id: 'e'.repeat(64), pubkey: 'p'.repeat(64), kind: 10063, created_at: 0, tags: [], content: '', sig: 's'.repeat(128) };
const delivered = { event, verdict: 'delivered' as const, targets: [{ url: 'wss://relay.example', ok: true }] };
const failed = { event, verdict: 'failed' as const, targets: [{ url: 'wss://bad.example', ok: false, message: 'down' }] };
const disabled = { event, verdict: 'disabled' as const, targets: [] };
const servers = [{ name: 'media.example', url: 'https://media.example', type: 'blossom' as const }];
type SaveResult = { blossom: typeof delivered; nip96: typeof disabled };


function renderPopup(onSave = vi.fn().mockResolvedValue({ blossom: delivered, nip96: disabled })) {
  const onClose = vi.fn();
  render(<ServerListPopup isOpen onClose={onClose} onSave={onSave} initialServers={servers} />);
  return { onClose, onSave };
}

afterEach(() => {
  cleanup();
  retryFailedTargets.mockReset();
});

describe('ServerListPopup save', () => {
  it('disables Save while a save is in flight', async () => {
    let resolve!: (value: SaveResult) => void;
    const onSave = vi.fn(() => new Promise<SaveResult>(done => { resolve = done; }));
    renderPopup(onSave);

    const save = screen.getByRole('button', { name: /save changes/i });
    await userEvent.click(save);

    expect(onSave).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /saving/i })).toHaveProperty('disabled', true);

    resolve({ blossom: delivered, nip96: disabled });
    await screen.findByText('Manage Servers');
  });

  it('closes only after both server lists publish successfully', async () => {
    const { onClose } = renderPopup();

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('keeps edits open after one list fails and retries only that list', async () => {
    const { onClose, onSave } = renderPopup(vi.fn().mockResolvedValue({ blossom: delivered, nip96: failed }));
    await userEvent.type(screen.getByPlaceholderText(/example.com/i), 'retry.example');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByText(/NIP-96 server list: Failed/i)).toBeTruthy();
    expect(screen.getAllByText('retry.example')).toHaveLength(2);

    retryFailedTargets.mockResolvedValue(delivered);
    await userEvent.click(screen.getByRole('button', { name: /retry failed/i }));

    expect(onSave).toHaveBeenCalledOnce();
    expect(retryFailedTargets).toHaveBeenCalledTimes(1);
    expect(retryFailedTargets).toHaveBeenCalledWith(failed);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
