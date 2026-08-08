import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createElement as h } from 'react';
import { BrowseSelectionBar } from './BrowseSelectionBar';
import { BrowseListRow } from './BrowseListRow';
import type { TimelineItem } from './browseConstants';

const item = (over: Partial<TimelineItem> = {}): TimelineItem =>
  ({
    id: 'p1',
    pubkey: 'pk',
    assetId: 'pk:immutable-event:e1',
    eventId: 'e1',
    eventKind: 20,
    eventAuthor: 'pk',
    displayType: 'image',
    displayTitle: 'A picture of a nesting box',
    displayTitleIsFallback: false,
    displaySubtitle: 'Taken last spring',
    searchText: 'a picture of a nesting box',
    displayDate: 1_700_000_000_000,
    displayDateSource: 'event',
    blobCount: 2,
    totalBlobSize: 2048,
    unknownBlobSizeCount: 0,
    replicaCount: 2,
    availabilityState: 'complete',
    metadataCompleteness: 'complete',
    ...over,
  }) as TimelineItem;

const render = (node: Parameters<typeof renderToString>[0]) => renderToString(h(MemoryRouter, null, node));

describe('browse presentation smoke', () => {
  it('renders a list row for every availability state and both title kinds', () => {
    for (const availabilityState of ['complete', 'partial', 'unavailable', 'unknown'] as const) {
      const html = render(
        h(BrowseListRow, {
          item: item({ availabilityState }),
          pubkey: 'pk',
          to: '/browse/x',
          selected: false,
          onSelect: () => {},
          onOpen: () => {},
          audioMetadataVersion: undefined,
          onAudioVisible: () => {},
        })
      );
      expect(html).toContain('nesting box');
      // availability must never be conveyed by colour alone
      expect(html).toMatch(/role="img"/);
    }
  });

  it('labels an asset with no event as an unlinked file rather than failing', () => {
    const html = render(
      h(BrowseListRow, {
        item: item({
          eventId: undefined,
          eventKind: undefined,
          displayTitle: 'Unlinked file',
          displayTitleIsFallback: true,
        }),
        pubkey: 'pk',
        to: '/browse/x',
        selected: false,
        onSelect: () => {},
        onOpen: () => {},
        audioMetadataVersion: undefined,
        onAudioVisible: () => {},
      })
    );
    expect(html).toContain('Unlinked file');
  });

  it('renders the selection bar with executable action labels', () => {
    const html = render(
      h(BrowseSelectionBar, {
        selectedItems: [item(), item({ assetId: 'b' })],
        onSelectAllVisible: () => {},
        onClear: () => {},
        onAction: () => {},
      })
    );
    expect(html).toContain('Mirror');
    expect(html).toContain('Sync');
    expect(html).toContain('Delete');
    // must not advertise actions as mere previews any more
    expect(html).not.toContain('Plan mirror');
  });
});
