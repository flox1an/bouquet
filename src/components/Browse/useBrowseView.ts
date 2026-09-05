import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCatalogClient } from '../../catalog/catalogClient';
import {
  isHashSearchTerm,
  normalizeServerUrl,
  sortTimelineProjections,
  splitSearchTerms,
  type TimelineSort,
} from '../../catalog/catalog';
import type { ServerInfo } from '../../utils/useServerInfo';
import type { AvailabilityFilter } from './BrowseFilterMenu';
import type { BrowseDisplayMode } from './BrowseToolbar';
import { groupRepeatedPosts, matchesTypeFilter, type TimelineItem, type TypeFilter } from './browseConstants';

export type BrowseViewState = {
  anchorAssetId?: string;
  anchorOffset?: number;
  availabilityFilter: AvailabilityFilter[];
  descriptiveOnly: boolean;
  displayMode: BrowseDisplayMode;
  eventOnly: boolean;
  unlinkedOnly: boolean;
  groupDuplicates: boolean;
  scrollY: number;
  search: string;
  selectedServerName?: string;
  sort: TimelineSort;
  typeFilter: TypeFilter;
};

export const DEFAULT_SORT: TimelineSort = { field: 'date', direction: 'desc' };

export function loadBrowseView(key: string): BrowseViewState | undefined {
  try {
    const value = sessionStorage.getItem(`bouquet:timeline:${key}`);
    return value ? (JSON.parse(value) as BrowseViewState) : undefined;
  } catch {
    return undefined;
  }
}

export function saveBrowseViewState(key: string, view: BrowseViewState): void {
  try {
    sessionStorage.setItem(`bouquet:timeline:${key}`, JSON.stringify(view));
  } catch {
    // Navigation remains available when browser storage is unavailable.
  }
}

export type BrowseFilters = Pick<
  BrowseViewState,
  | 'availabilityFilter'
  | 'descriptiveOnly'
  | 'eventOnly'
  | 'unlinkedOnly'
  | 'groupDuplicates'
  | 'search'
  | 'selectedServerName'
  | 'sort'
  | 'typeFilter'
>;

export type BrowseLookups = {
  displayMode: BrowseDisplayMode;
  serverId?: string;
  serverAssetIds?: Set<string>;
  hashMatchAssetIds?: Set<string>;
};

/** The page's filter predicate, pure so it can be tested without a mounted page. */
export function applyBrowseView(
  items: TimelineItem[],
  filters: BrowseFilters,
  lookups: BrowseLookups
): TimelineItem[] {
  const searchTerms = splitSearchTerms(filters.search);
  const hashTerms = searchTerms.filter(isHashSearchTerm);
  const textTerms = searchTerms.filter(term => !isHashSearchTerm(term));
  const filtered = items.filter(
    item =>
      (!filters.eventOnly || item.eventId !== undefined) &&
      (!filters.unlinkedOnly || item.eventId === undefined) &&
      (!filters.descriptiveOnly || !item.displayTitleIsFallback) &&
      matchesTypeFilter(item, filters.typeFilter) &&
      (filters.availabilityFilter.length === 0 || filters.availabilityFilter.includes(item.availabilityState)) &&
      (!lookups.serverId || lookups.serverAssetIds?.has(item.assetId)) &&
      textTerms.every(term => item.searchText.includes(term)) &&
      // A hash can also appear in an item's own text, so the catalog lookup only
      // adds the assets whose files match; it does not replace the text match.
      (hashTerms.length === 0 ||
        hashTerms.every(term => item.searchText.includes(term)) ||
        lookups.hashMatchAssetIds?.has(item.assetId) === true)
  );
  const sorted = lookups.displayMode === 'list' ? sortTimelineProjections(filtered, filters.sort) : filtered;
  return filters.groupDuplicates ? groupRepeatedPosts(sorted) : sorted;
}

/**
 * Browse view state: filters, sort, session-storage persistence, anchor/scroll
 * restoration, and the two catalog lookups the filters need (server membership,
 * hash search). The page composes this with the refresh loop and stays out of
 * the state machines.
 */
export function useBrowseView(input: {
  timelineLocationKey: string;
  items: TimelineItem[];
  /** The refresh loop's completion signal; restoration waits for it. */
  ready: boolean;
  /** Bumped by the refresh loop's single coalescing subscription. */
  version: number;
  serverInfo: Record<string, ServerInfo>;
  pubkey: string | undefined;
}) {
  const { timelineLocationKey, items, ready, version, serverInfo, pubkey } = input;
  const initialView = useRef(loadBrowseView(timelineLocationKey));
  const scrollRestored = useRef(false);

  const [displayMode, setDisplayMode] = useState<BrowseDisplayMode>(() => initialView.current?.displayMode ?? 'media');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(() => initialView.current?.typeFilter ?? 'all');
  const [eventOnly, setEventOnlyState] = useState(() => initialView.current?.eventOnly ?? false);
  const [unlinkedOnly, setUnlinkedOnlyState] = useState(() => initialView.current?.unlinkedOnly ?? false);
  // The two are opposite ends of the same axis - "has an event" vs. "does not" -
  // so turning one on always turns the other off, instead of silently combining
  // into a filter that can never match anything.
  const setEventOnly = useCallback((value: boolean) => {
    setEventOnlyState(value);
    if (value) setUnlinkedOnlyState(false);
  }, []);
  const setUnlinkedOnly = useCallback((value: boolean) => {
    setUnlinkedOnlyState(value);
    if (value) setEventOnlyState(false);
  }, []);
  const [descriptiveOnly, setDescriptiveOnly] = useState(() => initialView.current?.descriptiveOnly ?? false);
  const [groupDuplicates, setGroupDuplicates] = useState(() => initialView.current?.groupDuplicates ?? true);
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter[]>(
    () => initialView.current?.availabilityFilter ?? []
  );
  const [search, setSearch] = useState(() => initialView.current?.search ?? '');
  const [sort, setSort] = useState<TimelineSort>(() => initialView.current?.sort ?? DEFAULT_SORT);
  const [selectedServerName, setSelectedServerName] = useState<string | undefined>(
    () => initialView.current?.selectedServerName
  );
  const [serverAssetIds, setServerAssetIds] = useState<Set<string>>();
  const [hashMatchAssetIds, setHashMatchAssetIds] = useState<Set<string>>();
  const [lookupError, setLookupError] = useState<string>();

  const searchTerms = useMemo(() => splitSearchTerms(search), [search]);
  const hashTerms = useMemo(() => searchTerms.filter(isHashSearchTerm), [searchTerms]);
  const textTerms = useMemo(() => searchTerms.filter(term => !isHashSearchTerm(term)), [searchTerms]);

  const selectedServer = selectedServerName ? serverInfo[selectedServerName] : undefined;
  const serverId = selectedServer && !selectedServer.virtual ? normalizeServerUrl(selectedServer.url) : undefined;

  // Server membership changes only when the catalog changes; the refresh loop's
  // `version` is that signal, so these lookups never re-run on an unrelated
  // re-render.
  useEffect(() => {
    if (!pubkey || !serverId) {
      setServerAssetIds(undefined);
      return;
    }
    let active = true;
    void getCatalogClient()
      .queryCatalogAssetIds({ serverId })
      .then(assetIds => {
        if (!active) return;
        setServerAssetIds(new Set(assetIds));
        setLookupError(undefined);
      })
      .catch(() => {
        // Leaving the set empty would filter everything out and read as
        // "you have nothing here", which is a wrong answer stated confidently.
        if (!active) return;
        setServerAssetIds(undefined);
        setLookupError('The server filter could not be applied, so everything is shown.');
      });
    return () => {
      active = false;
    };
  }, [version, serverId, pubkey]);

  // Hash search needs the asset's full blob set, which the projection does not carry.
  // Only sha256-looking terms take this path, so ordinary typing stays client-side.
  useEffect(() => {
    if (!pubkey || hashTerms.length === 0) {
      setHashMatchAssetIds(undefined);
      return;
    }
    let active = true;
    void getCatalogClient()
      .queryCatalogAssetIds({ hashTerms })
      .then(assetIds => {
        if (!active) return;
        setHashMatchAssetIds(new Set(assetIds));
        setLookupError(undefined);
      })
      .catch(() => {
        if (!active) return;
        setHashMatchAssetIds(undefined);
        setLookupError('The hash search could not be run, so results may be incomplete.');
      });
    return () => {
      active = false;
    };
  }, [version, hashTerms, pubkey]);

  const filters = useMemo(
    () => ({
      availabilityFilter,
      descriptiveOnly,
      eventOnly,
      unlinkedOnly,
      groupDuplicates,
      search,
      selectedServerName,
      sort,
      typeFilter,
    }),
    [availabilityFilter, descriptiveOnly, eventOnly, unlinkedOnly, groupDuplicates, search, selectedServerName, sort, typeFilter]
  );
  const filteredItems = useMemo(
    () =>
      applyBrowseView(items, filters, {
        displayMode,
        serverId,
        serverAssetIds,
        hashMatchAssetIds,
      }),
    [items, filters, displayMode, serverId, serverAssetIds, hashMatchAssetIds]
  );

  // Anchor and scroll restoration runs once per visit, after the first complete
  // projection gives the DOM something to anchor against.
  useEffect(() => {
    const view = initialView.current;
    if (!view || scrollRestored.current || !ready) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const anchor = view.anchorAssetId
          ? [...document.querySelectorAll<HTMLElement>('[data-asset-id]')].find(
              element => element.dataset.assetId === view.anchorAssetId
            )
          : undefined;
        const top =
          anchor && view.anchorOffset !== undefined
            ? window.scrollY + anchor.getBoundingClientRect().top - view.anchorOffset
            : view.scrollY;
        window.scrollTo({ top, behavior: 'auto' });
        scrollRestored.current = true;
      });
    });
  }, [ready]);

  const saveBrowseView = useCallback(
    (anchorAssetId?: string, anchorOffset?: number) => {
      saveBrowseViewState(timelineLocationKey, {
        anchorAssetId,
        anchorOffset,
        availabilityFilter,
        descriptiveOnly,
        displayMode,
        eventOnly,
        groupDuplicates,
        unlinkedOnly,
        scrollY: window.scrollY,
        search,
        selectedServerName,
        sort,
        typeFilter,
      });
    },
    [timelineLocationKey, availabilityFilter, descriptiveOnly, displayMode, eventOnly, groupDuplicates, unlinkedOnly, search, selectedServerName, sort, typeFilter]
  );

  const clearAllFilters = useCallback(() => {
    setSearch('');
    setTypeFilter('all');
    setAvailabilityFilter([]);
    setSelectedServerName(undefined);
    setEventOnly(false);
    setDescriptiveOnly(false);
  }, [setEventOnly]);

  return {
    displayMode,
    setDisplayMode,
    typeFilter,
    setTypeFilter,
    eventOnly,
    setEventOnly,
    unlinkedOnly,
    setUnlinkedOnly,
    descriptiveOnly,
    setDescriptiveOnly,
    groupDuplicates,
    setGroupDuplicates,
    availabilityFilter,
    setAvailabilityFilter,
    search,
    setSearch,
    sort,
    setSort,
    selectedServerName,
    setSelectedServerName,
    searchTerms,
    hashTerms,
    textTerms,
    serverId,
    lookupError,
    filteredItems,
    clearAllFilters,
    saveBrowseView,
  };
}
