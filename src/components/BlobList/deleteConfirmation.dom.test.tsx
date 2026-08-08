/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement as h } from 'react';
import type { BlobDescriptor } from 'blossom-client-sdk';
import DeleteProgressDialog from './DeleteProgressDialog';

afterEach(cleanup);

const blob = (i: number): BlobDescriptor =>
  ({
    sha256: i.toString(16).padStart(64, '0'),
    url: `https://media.example/${i}`,
    type: 'image/jpeg',
    size: 10,
    uploaded: 1,
  }) as BlobDescriptor;

describe('delete confirmation', () => {
  it('deletes nothing until the user confirms', async () => {
    const onDeleteOne = vi.fn().mockResolvedValue(undefined);
    render(h(DeleteProgressDialog, { open: true, blobs: [blob(1), blob(2)], onDeleteOne, onClose: () => {} }));

    // The dialog opening must not be enough to destroy anything.
    expect(onDeleteOne).not.toHaveBeenCalled();
    expect(screen.getByText(/Delete 2 files\?/i)).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: /Delete 2 files/i }));
    await vi.waitFor(() => expect(onDeleteOne).toHaveBeenCalledTimes(2));
  });

  it('keeps the selection when the user backs out', async () => {
    const onDeleteOne = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const onDeletionFinished = vi.fn();
    render(
      h(DeleteProgressDialog, {
        open: true,
        blobs: [blob(3)],
        onDeleteOne,
        onClose,
        onDeletionFinished,
      })
    );

    await userEvent.click(screen.getByRole('button', { name: /^Cancel$/i }));
    expect(onClose).toHaveBeenCalled();
    expect(onDeleteOne).not.toHaveBeenCalled();
    // The caller clears the selection on this callback, so it must stay silent.
    expect(onDeletionFinished).not.toHaveBeenCalled();
  });

  it('reports failures instead of claiming success', async () => {
    const onDeleteOne = vi.fn().mockRejectedValueOnce(new Error('server refused')).mockResolvedValue(undefined);
    render(h(DeleteProgressDialog, { open: true, blobs: [blob(4), blob(5)], onDeleteOne, onClose: () => {} }));
    await userEvent.click(screen.getByRole('button', { name: /Delete 2 files/i }));
    await vi.waitFor(() => expect(screen.getByText(/could not be deleted/i)).toBeTruthy());
    expect(screen.queryByText(/Deletion complete/i)).toBeNull();
  });
});
