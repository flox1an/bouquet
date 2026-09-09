import { describe, expect, it } from 'vitest';
import type { TimelineSort } from '../../catalog/catalog';
import { applyBrowseView, loadBrowseView, saveBrowseViewState, type BrowseFilters } from './useBrowseView';
import type { TimelineItem } from './browseConstants';

const item = (overrides: Partial<TimelineItem> & { assetId: string }): TimelineItem =>
  ({
    searchText: '',
    availabilityState: 'unknown',
    displayTitleIsFallback: false,
    eventId: undefined,
    displayDate: 0,
    ...overrides,
  }) as TimelineItem;

const filters: BrowseFilters = {
  availabilityFilter: [],
  descriptiveOnly: false,
  eventOnly: false,
  unlinkedOnly: false,
  groupDuplicates: false,
  search: '',
  sort: { field: 'date', direction: 'desc' } as TimelineSort,
  typeFilter: 'all',
};

describe('applyBrowseView', () => {
  it('keeps only unlinked files when the unlinked filter is on', () => {
    const items = [item({ assetId: 'linked', eventId: 'e1' }), item({ assetId: 'unlinked' })];
    const result = applyBrowseView(items, { ...filters, unlinkedOnly: true }, { displayMode: 'media' });
    expect(result.map(entry => entry.assetId)).toEqual(['unlinked']);
  });

  it('admits a hash-matched asset even when its text does not contain the hash term', () => {
    const hashTerm = 'a'.repeat(16);
    const items = [item({ assetId: 'hit', searchText: 'sunset photo' })];
    const result = applyBrowseView(
      items,
      { ...filters, search: hashTerm },
      { displayMode: 'media', hashMatchAssetIds: new Set(['hit']) }
    );
    expect(result.map(entry => entry.assetId)).toEqual(['hit']);
  });
});

describe('persisted view round trip', () => {
  it('survives a save/load cycle through session storage', () => {
    saveBrowseViewState('test-key', {
      availabilityFilter: ['complete'],
      descriptiveOnly: true,
      displayMode: 'list',
      eventOnly: true,
      unlinkedOnly: false,
      groupDuplicates: false,
      scrollY: 421,
      search: 'sunset',
      selectedServerName: 'one',
      sort: { field: 'size', direction: 'asc' },
      typeFilter: 'video',
      anchorAssetId: 'asset-1',
      anchorOffset: 12,
    });

    expect(loadBrowseView('test-key')).toMatchObject({
      search: 'sunset',
      selectedServerName: 'one',
      typeFilter: 'video',
      displayMode: 'list',
      scrollY: 421,
      anchorAssetId: 'asset-1',
      anchorOffset: 12,
    });
    sessionStorage.removeItem('bouquet:timeline:test-key');
  });
});
