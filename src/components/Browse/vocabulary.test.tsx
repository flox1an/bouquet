import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createElement as h } from 'react';
import { BrowseListRow } from './BrowseListRow';
import { BrowseSelectionBar } from './BrowseSelectionBar';
import type { TimelineItem } from './browseConstants';

const item = (over: Partial<TimelineItem> = {}): TimelineItem =>
  ({
    id: 'p1',
    pubkey: 'pk',
    assetId: 'a1',
    eventId: 'e1',
    eventKind: 20,
    eventAuthor: 'pk',
    displayType: 'image',
    displayTitle: 'Nesting box',
    displayTitleIsFallback: false,
    searchText: 'nesting box',
    displayDate: 1700000000000,
    displayDateSource: 'event',
    blobCount: 3,
    totalBlobSize: 2048,
    unknownBlobSizeCount: 0,
    replicaCount: 2,
    availabilityState: 'complete',
    metadataCompleteness: 'complete',
    ...over,
  }) as TimelineItem;

// Assert on what a person reads: React separates adjacent text nodes with
// <!-- --> in SSR, and attributes like data-asset-id are not visible copy.
const visibleText = (html: string) =>
  html
    .replace(/<!--.*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const render = (n: Parameters<typeof renderToString>[0]) => visibleText(renderToString(h(MemoryRouter, null, n)));
const row = (over = {}) =>
  render(
    h(BrowseListRow, {
      item: item(over),
      pubkey: 'pk',
      to: '/x',
      selected: false,
      onSelect: () => {},
      onOpen: () => {},
      audioMetadataVersion: undefined,
      onAudioVisible: () => {},
    })
  );

describe('plain vocabulary renders as real words', () => {
  it('pluralises copies without splitting the word', () => {
    const many = row({ replicaCount: 2 });
    expect(many).toContain('2 copies');
    expect(many).not.toMatch(/cop\s+ies/);
    const one = row({ replicaCount: 1 });
    expect(one).toContain('1 copy');
    expect(one).not.toMatch(/cop\s+y/);
  });

  it('counts files and items, never blobs or assets', () => {
    const html = row({ blobCount: 3 });
    expect(html).toMatch(/3 files/);
    const bar = render(
      h(BrowseSelectionBar, {
        selectedItems: [item(), item({ assetId: 'a2' })],
        onSelectAllVisible: () => {},
        onClear: () => {},
        onAction: () => {},
      })
    );
    expect(bar).toContain('2 items selected');
    expect(bar).toMatch(/6 files/);
    for (const html2 of [html, bar]) {
      expect(html2).not.toMatch(/\bblobs?\b/i);
      expect(html2).not.toMatch(/\bassets?\b/i);
      expect(html2).not.toMatch(/\breplicas?\b/i);
    }
  });
});
