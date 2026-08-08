import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { getCatalog, normalizeServerUrl } from '../catalog/catalog';
import {
  projectCatalogAssets,
  queryCatalogTimeline,
  isHashSearchTerm,
  refreshEventUrlAvailability,
  sortTimelineProjections,
  splitSearchTerms,
  type CatalogAction,
  type TimelineSort,
} from '../catalog/advanced';
import { useNostr } from '../utils/nostr';
import { useCatalogStatus } from '../catalog/useCatalogStatus';
import { useServerInfo } from '../utils/useServerInfo';
import { useUserServers, type Server } from '../utils/useUserServers';
import ServerListPopup from '../components/ServerListPopup';
import { TimelineNavigation, groupByMonth } from '../components/TimelineNavigation';
import { queueId3Tag, type ID3Tag } from '../utils/id3';
import { useGlobalContext } from '../GlobalState';
import { probeNativeUrl } from '../catalog/availabilityFetch';
import { BrowseToolbar, type BrowseDisplayMode } from '../components/Browse/BrowseToolbar';
import { BrowseMediaGrid } from '../components/Browse/BrowseMediaGrid';
import { BrowseListView } from '../components/Browse/BrowseListView';
import { BrowseSelectionBar } from '../components/Browse/BrowseSelectionBar';
import { BrowseActionPlanDialog } from '../components/Browse/BrowseActionPlanDialog';
import { useAssetSelection } from '../components/Browse/useAssetSelection';
import type { AvailabilityFilter } from '../components/Browse/BrowseFilterMenu';
import type { TimelineItem, TypeFilter } from '../components/Browse/browseConstants';

type BrowseViewState = {
  anchorAssetId?: string;
  anchorOffset?: number;
  availabilityFilter: AvailabilityFilter[];
  descriptiveOnly: boolean;
  displayMode: BrowseDisplayMode;
  eventOnly: boolean;
  scrollY: number;
  search: string;
  selectedServerName?: string;
  sort: TimelineSort;
  typeFilter: TypeFilter;
};
type TimelineReturnState = { timelineLocationKey?: string };

function storedBrowseView(key: string): BrowseViewState | undefined {
  try {
    const value = sessionStorage.getItem(`bouquet:timeline:${key}`);
    return value ? (JSON.parse(value) as BrowseViewState) : undefined;
  } catch {
    return undefined;
  }
}

const DEFAULT_SORT: TimelineSort = { field: 'date', direction: 'desc' };

export default function Timeline() {
  const { user, signEventTemplate } = useNostr();
  const { dispatch } = useGlobalContext();
  const location = useLocation();
  const navigate = useNavigate();
  const timelineLocationKey = (location.state as TimelineReturnState | null)?.timelineLocationKey ?? location.key;
  const status = useCatalogStatus(user?.pubkey);
  const { serverInfo, distribution } = useServerInfo();
  const { storeUserServers } = useUserServers();
  const [isServerListDialogOpen, setIsServerListDialogOpen] = useState(false);
  const initialView = useRef(storedBrowseView(timelineLocationKey));
  const scrollRestored = useRef(false);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [audioMetadata, setAudioMetadata] = useState<Record<string, ID3Tag>>({});
  const [audioMetadataVersion, setAudioMetadataVersion] = useState<Record<string, number>>({});
  const audioProjectionTimer = useRef<number | undefined>(undefined);
  const [projectionState, setProjectionState] = useState<'idle' | 'projecting' | 'complete' | 'failed'>('idle');

  const [displayMode, setDisplayMode] = useState<BrowseDisplayMode>(() => initialView.current?.displayMode ?? 'media');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(() => initialView.current?.typeFilter ?? 'all');
  const [eventOnly, setEventOnly] = useState(() => initialView.current?.eventOnly ?? false);
  const [descriptiveOnly, setDescriptiveOnly] = useState(() => initialView.current?.descriptiveOnly ?? false);
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
  const [catalogVersion, setCatalogVersion] = useState(0);
  const [lookupError, setLookupError] = useState<string>();
  const [activeMonth, setActiveMonth] = useState<string>();
  const [bulkAction, setBulkAction] = useState<CatalogAction>();
  const [cardAction, setCardAction] = useState<{ action: CatalogAction; item: TimelineItem }>();

  useEffect(() => {
    if (!user?.pubkey) {
      setItems([]);
      setProjectionState('idle');
      return;
    }

    let active = true;
    const catalog = getCatalog();

    void queryCatalogTimeline(catalog, user.pubkey)
      .then(cached => {
        if (!active || cached.length === 0) return;
        setItems(cached);
        setProjectionState('complete');
      })
      .catch(() => {
        // The full projection below is the real source; a failed cache read only
        // costs a slower first paint, so it must not surface as an error.
      });

    let timer: number | undefined;
    const runProjection = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!active) return;
        setProjectionState(current => (current === 'complete' ? current : 'projecting'));
        void (async () => {
          await catalog.reprojectEvents(user.pubkey);
          await refreshEventUrlAvailability(catalog, user.pubkey, probeNativeUrl);
          await projectCatalogAssets(catalog, user.pubkey);
          return queryCatalogTimeline(catalog, user.pubkey);
        })()
          .then(projected => {
            if (!active) return;
            setItems(projected);
            setProjectionState('complete');
          })
          .catch(() => {
            if (active) setProjectionState(current => (current === 'complete' ? current : 'failed'));
          });
      }, 200);
    };

    runProjection();
    window.addEventListener('bouquet-catalog-changed', runProjection);

    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener('bouquet-catalog-changed', runProjection);
    };
  }, [user?.pubkey]);

  const searchTerms = useMemo(() => splitSearchTerms(search), [search]);
  const hashTerms = useMemo(() => searchTerms.filter(isHashSearchTerm), [searchTerms]);
  const textTerms = useMemo(() => searchTerms.filter(term => !isHashSearchTerm(term)), [searchTerms]);

  const selectedServer = selectedServerName ? serverInfo[selectedServerName] : undefined;
  const serverId = selectedServer && !selectedServer.virtual ? normalizeServerUrl(selectedServer.url) : undefined;

  // Catalog-backed lookups below must re-run when the catalog itself changes, not
  // whenever `items` happens to be replaced. Audio metadata reprojection rewrites
  // `items` frequently and would otherwise re-read every blob location each time.
  useEffect(() => {
    const bump = () => setCatalogVersion(version => version + 1);
    window.addEventListener('bouquet-catalog-changed', bump);
    return () => window.removeEventListener('bouquet-catalog-changed', bump);
  }, []);

  useEffect(() => {
    if (!user?.pubkey || !serverId) {
      setServerAssetIds(undefined);
      return;
    }
    let active = true;
    void queryCatalogTimeline(getCatalog(), user.pubkey, { serverId })
      .then(result => {
        if (!active) return;
        setServerAssetIds(new Set(result.map(item => item.assetId)));
        setLookupError(undefined);
      })
      .catch(() => {
        // Leaving the set empty would filter everything out and read as
        // "you have nothing here", which is a wrong answer stated confidently.
        if (!active) return;
        setServerAssetIds(undefined);
        setLookupError('The server filter could not be applied, so every asset is shown.');
      });
    return () => {
      active = false;
    };
  }, [catalogVersion, serverId, user?.pubkey]);

  // Hash search needs the asset's full blob set, which the projection does not carry.
  // Only sha256-looking terms take this path, so ordinary typing stays client-side.
  useEffect(() => {
    if (!user?.pubkey || hashTerms.length === 0) {
      setHashMatchAssetIds(undefined);
      return;
    }
    let active = true;
    void queryCatalogTimeline(getCatalog(), user.pubkey, { search: hashTerms.join(' ') })
      .then(result => {
        if (!active) return;
        setHashMatchAssetIds(new Set(result.map(item => item.assetId)));
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
  }, [catalogVersion, hashTerms, user?.pubkey]);

  const filteredItems = useMemo(() => {
    const filtered = items.filter(
      item =>
        (!eventOnly || item.eventId !== undefined) &&
        (!descriptiveOnly || !item.displayTitleIsFallback) &&
        (typeFilter === 'all' ||
          (typeFilter === 'media' ? item.displayType !== 'unknown' : item.displayType === typeFilter)) &&
        (availabilityFilter.length === 0 || availabilityFilter.includes(item.availabilityState)) &&
        (!serverId || serverAssetIds?.has(item.assetId)) &&
        textTerms.every(term => item.searchText.includes(term)) &&
        (hashTerms.length === 0 || hashMatchAssetIds?.has(item.assetId) === true)
    );
    return displayMode === 'list' ? sortTimelineProjections(filtered, sort) : filtered;
  }, [
    availabilityFilter,
    descriptiveOnly,
    displayMode,
    eventOnly,
    hashMatchAssetIds,
    hashTerms,
    items,
    serverAssetIds,
    serverId,
    sort,
    textTerms,
    typeFilter,
  ]);

  const orderedAssetIds = useMemo(() => filteredItems.map(item => item.assetId), [filteredItems]);
  const { selectedAssetIds, handleSelectAsset, clearSelection, selectAll } = useAssetSelection(orderedAssetIds);
  const selectedItems = useMemo(
    () => filteredItems.filter(item => selectedAssetIds[item.assetId]),
    [filteredItems, selectedAssetIds]
  );

  useEffect(() => {
    const view = initialView.current;
    if (!view || scrollRestored.current || projectionState !== 'complete') return;
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
  }, [projectionState]);

  const saveBrowseView = (anchorAssetId?: string, anchorOffset?: number) => {
    try {
      sessionStorage.setItem(
        `bouquet:timeline:${timelineLocationKey}`,
        JSON.stringify({
          anchorAssetId,
          anchorOffset,
          availabilityFilter,
          descriptiveOnly,
          displayMode,
          eventOnly,
          scrollY: window.scrollY,
          search,
          selectedServerName,
          sort,
          typeFilter,
        } satisfies BrowseViewState)
      );
    } catch {
      // Navigation remains available when browser storage is unavailable.
    }
  };

  const scheduleAudioProjection = () => {
    if (!user?.pubkey) return;
    if (audioProjectionTimer.current !== undefined) window.clearTimeout(audioProjectionTimer.current);
    audioProjectionTimer.current = window.setTimeout(() => {
      const catalog = getCatalog();
      void projectCatalogAssets(catalog, user.pubkey, { force: true })
        .then(() => queryCatalogTimeline(catalog, user.pubkey))
        .then(setItems)
        .catch(() => undefined);
    }, 200);
  };

  const loadAudioMetadata = (item: TimelineItem) => {
    if (!user?.pubkey || !item.primaryBlobSha256 || !item.primaryUrl) return;
    void queueId3Tag(item.primaryBlobSha256, item.primaryUrl)
      .then(async result => {
        if (!result) return;
        await getCatalog().ingestId3(item.primaryBlobSha256!, result.id3);
        setAudioMetadata(current => ({ ...current, [item.primaryBlobSha256!]: result.id3 }));
        setAudioMetadataVersion(current => ({ ...current, [item.assetId]: (current[item.assetId] ?? 0) + 1 }));
        scheduleAudioProjection();
      })
      .catch(() => undefined);
  };

  const playAudio = (item: TimelineItem) => {
    if (!item.primaryUrl) return;
    dispatch({
      type: 'SET_CURRENT_SONG',
      song: { url: item.primaryUrl, id3: item.primaryBlobSha256 ? audioMetadata[item.primaryBlobSha256] : undefined },
    });
  };

  const openAsset = (assetId: string, anchorOffset?: number) => {
    saveBrowseView(assetId, anchorOffset);
    navigate(`/browse/${encodeURIComponent(assetId)}`, { state: { timelineLocationKey } });
  };

  const monthGroups = useMemo(() => groupByMonth(filteredItems), [filteredItems]);

  const scrollToMonth = (key: string) => {
    const el = document.querySelector(`[data-month="${key}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (displayMode !== 'media') return;
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const key = entry.target.getAttribute('data-month');
            if (key) setActiveMonth(key);
          }
        }
      },
      { rootMargin: '-80px 0px 60% 0px' }
    );
    const targets = document.querySelectorAll('[data-month]');
    for (const el of targets) observer.observe(el);
    return () => observer.disconnect();
  }, [displayMode, monthGroups]);

  const handleSaveServers = async (newServers: Server[]) => {
    await storeUserServers(newServers);
  };

  if (!user?.pubkey) {
    return (
      <main className="mx-auto flex min-h-[55vh] max-w-2xl flex-col justify-center px-6">
        <EmptyState
          title="Sign in to open your media catalog"
          detail="Bouquet keeps the timeline local to each Nostr identity."
        />
      </main>
    );
  }
  if (status && status.knownHashes === 0) {
    return (
      <main className="mx-auto flex min-h-[55vh] max-w-2xl flex-col justify-center px-6">
        <EmptyState
          title="Your catalog is waiting for its first source"
          detail="Add a media server, or publish an event, and your media appears here as discovery finishes."
        />
        <div className="mt-6">
          <Button onClick={() => setIsServerListDialogOpen(true)}>Add a media server</Button>
        </div>
        <ServerListPopup
          isOpen={isServerListDialogOpen}
          onClose={() => setIsServerListDialogOpen(false)}
          onSave={handleSaveServers}
          initialServers={Object.values(serverInfo).filter(s => !s.virtual)}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col px-4 py-8">
      <header className="mb-8 border-b-2 border-primary pb-5">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">Browse catalog</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tight">Browse</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {status?.knownHashes ?? 0} known blobs, arranged as explainable media.
            </p>
          </div>
          <p className="rounded-full bg-primary px-3 py-1 font-mono text-xs text-primary-foreground">offline index</p>
        </div>
      </header>

      <BrowseToolbar
        search={search}
        onSearchChange={setSearch}
        displayMode={displayMode}
        onDisplayModeChange={setDisplayMode}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        sort={sort}
        onSortChange={setSort}
        servers={Object.values(serverInfo)}
        selectedServerName={selectedServerName}
        onServerChange={setSelectedServerName}
        onManageServers={() => setIsServerListDialogOpen(true)}
        eventOnly={eventOnly}
        onEventOnlyChange={setEventOnly}
        descriptiveOnly={descriptiveOnly}
        onDescriptiveOnlyChange={setDescriptiveOnly}
        availabilityFilter={availabilityFilter}
        onAvailabilityFilterChange={setAvailabilityFilter}
        matchingCount={filteredItems.length}
      />

      <ServerListPopup
        isOpen={isServerListDialogOpen}
        onClose={() => setIsServerListDialogOpen(false)}
        onSave={handleSaveServers}
        initialServers={Object.values(serverInfo).filter(s => !s.virtual)}
      />

      {lookupError && (
        <p
          className="mb-4 border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="status"
        >
          {lookupError}
        </p>
      )}

      <BrowseSelectionBar
        selectedItems={selectedItems}
        onSelectAllVisible={selectAll}
        onClear={clearSelection}
        onAction={setBulkAction}
      />

      {bulkAction && user?.pubkey && (
        <BrowseActionPlanDialog
          open
          action={bulkAction}
          assets={selectedItems}
          pubkey={user.pubkey}
          distribution={distribution}
          serverInfo={serverInfo}
          signEventTemplate={signEventTemplate}
          onClose={() => setBulkAction(undefined)}
          onDeleted={() => {
            clearSelection();
            setBulkAction(undefined);
          }}
        />
      )}

      {cardAction && user?.pubkey && (
        <BrowseActionPlanDialog
          open
          action={cardAction.action}
          assets={[cardAction.item]}
          pubkey={user.pubkey}
          distribution={distribution}
          serverInfo={serverInfo}
          signEventTemplate={signEventTemplate}
          onClose={() => setCardAction(undefined)}
          onDeleted={() => setCardAction(undefined)}
        />
      )}

      {displayMode === 'media' && (
        <div className="lg:hidden">
          <TimelineNavigation months={monthGroups} activeMonth={activeMonth} onSelect={scrollToMonth} />
        </div>
      )}

      <div className="mt-4 flex flex-1 gap-6">
        <section className="min-w-0 flex-1" aria-label="Assets">
          {displayMode === 'media' ? (
            <BrowseMediaGrid
              monthGroups={monthGroups}
              filteredItems={filteredItems}
              toFor={assetId => `/browse/${encodeURIComponent(assetId)}`}
              selectedAssetIds={selectedAssetIds}
              onSelect={handleSelectAsset}
              onOpen={openAsset}
              audioMetadataVersion={audioMetadataVersion}
              onAudioVisible={loadAudioMetadata}
              onPlayAudio={playAudio}
              onAction={(item, action) => setCardAction({ item, action })}
            />
          ) : (
            <BrowseListView
              items={filteredItems}
              pubkey={user.pubkey}
              toFor={assetId => `/browse/${encodeURIComponent(assetId)}`}
              selectedAssetIds={selectedAssetIds}
              onSelect={handleSelectAsset}
              onOpen={assetId => openAsset(assetId)}
              audioMetadataVersion={audioMetadataVersion}
              onAudioVisible={loadAudioMetadata}
            />
          )}
        </section>

        {displayMode === 'media' && (
          <aside className="hidden w-36 shrink-0 lg:block">
            <div className="sticky top-8">
              <TimelineNavigation months={monthGroups} activeMonth={activeMonth} onSelect={scrollToMonth} />
            </div>
          </aside>
        )}
      </div>
      {items.length === 0 && projectionState === 'projecting' && (
        <ProjectionNotice knownHashes={status?.knownHashes ?? 0} />
      )}
      {items.length === 0 && projectionState === 'complete' && (
        <EmptyState
          title="No media items found yet"
          detail="Your catalog finished indexing. Media references from new events and server lists will appear here."
        />
      )}
      {items.length === 0 && projectionState === 'failed' && (
        <EmptyState
          title="Projection paused"
          detail="Your catalog remains intact. Return after the next sync to try projecting the media again."
        />
      )}
      {items.length > 0 && filteredItems.length === 0 && (
        <EmptyState
          title="No matching media"
          detail="Try another media type, search term, or clear the server and availability filters."
        />
      )}
    </main>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="max-w-lg">
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">Browse</p>
      <h1 className="mt-3 text-4xl font-black tracking-tight">{title}</h1>
      <p className="mt-3 text-muted-foreground">{detail}</p>
    </section>
  );
}

function ProjectionNotice({ knownHashes }: { knownHashes: number }) {
  return (
    <section className="mx-auto max-w-xl border bg-card p-6 shadow-[4px_4px_0_hsl(var(--border))]" aria-live="polite">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Indexing local media</p>
          <h2 className="mt-1 text-xl font-bold">Building the first projection</h2>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Reading event and server-list evidence for {knownHashes.toLocaleString()} known blob
        {knownHashes === 1 ? '' : 's'}.
      </p>
      <div
        className="mt-5 h-2 overflow-hidden border bg-muted"
        role="progressbar"
        aria-label="Building media projection"
        aria-valuetext="In progress"
      >
        <div className="h-full w-2/3 bg-primary animate-pulse motion-reduce:animate-none" />
      </div>
      <p className="mt-3 font-mono text-xs text-muted-foreground">
        This can take a moment. Your catalog stays available while it runs.
      </p>
    </section>
  );
}
