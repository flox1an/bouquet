/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { signAndPublish, retryFailedTargets } = vi.hoisted(() => ({ signAndPublish: vi.fn(), retryFailedTargets: vi.fn() }));
vi.mock('../../utils/publish', () => ({ signAndPublish, retryFailedTargets }));
vi.mock('../../utils/nostr', () => ({ useNostr: () => ({ user: { pubkey: 'p'.repeat(64), relayUrls: ['wss://relay.example'] } }) }));
vi.mock('../../nostr/core', () => ({ mergeRelays: (relays: string[]) => relays }));
vi.mock('../FileEventEditor/FileEventEditor', () => ({
  default: ({ fileEventData }: { fileEventData: { x: string } }) => <p>Editing {fileEventData.x}</p>,
}));

import { DescribeUnlinkedFileDialog } from './DescribeUnlinkedFileDialog';

const data = {
  content: 'Known catalog description',
  url: ['https://server.example/file.mp4'],
  x: 'a'.repeat(64),
  m: 'video/mp4',
  size: 42,
  title: 'Known catalog title',
  tags: [],
  publish: {},
  events: [],
};

function signedEvent(template: Record<string, unknown>) {
  return { ...template, id: 'e'.repeat(64), sig: 's'.repeat(128) };
}

afterEach(() => {
  cleanup();
  signAndPublish.mockReset();
  retryFailedTargets.mockReset();
});

describe('DescribeUnlinkedFileDialog', () => {
  it('publishes catalog metadata as a file event and records the delivered event', async () => {
    signAndPublish.mockImplementation(async (template: Record<string, unknown>) => ({
      event: signedEvent(template),
      verdict: 'delivered',
      targets: [{ url: 'wss://relay.example', ok: true }],
    }));
    const onOpenChange = vi.fn();
    const onPublished = vi.fn().mockResolvedValue(undefined);
    render(<DescribeUnlinkedFileDialog open onOpenChange={onOpenChange} initialData={data} onPublished={onPublished} />);

    await userEvent.click(screen.getByRole('button', { name: /publish metadata/i }));

    const template = signAndPublish.mock.calls[0][0] as { tags: string[][] };
    expect(template.tags).toEqual(expect.arrayContaining([
      ['url', 'https://server.example/file.mp4'],
      ['x', 'a'.repeat(64)],
      ['size', '42'],
      ['m', 'video/mp4'],
    ]));
    expect(onPublished).toHaveBeenCalledWith(expect.objectContaining({ id: 'e'.repeat(64) }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('cancels without publishing or changing the catalog', async () => {
    const onPublished = vi.fn();
    render(<DescribeUnlinkedFileDialog open onOpenChange={() => {}} initialData={data} onPublished={onPublished} />);

    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(signAndPublish).not.toHaveBeenCalled();
    expect(onPublished).not.toHaveBeenCalled();
  });
});
