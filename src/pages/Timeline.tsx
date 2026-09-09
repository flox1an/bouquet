import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { getCatalogClient } from '../catalog/catalogClient';
import { identifyUnexplainedBlobs } from '../catalog/identifyBlobs';
import type { CatalogAction } from '../catalog/catalog';
import {
  syncAdditionalPubkeyFromRelays,
  syncAuthoredEventsFromRelays,
  syncReverseLookupsFromRelays,
} from '../catalog/catalogNostr';
import { useNostr } from '../utils/nostr';
import { useCatalogStatus } from '../catalog/useCatalogStatus';
import { useServerInfo } from '../utils/useServerInfo';
import { useUserServers, type Server } from '../utils/useUserServers';
import ServerListPopup from '../components/ServerListPopup';
import { TimelineNavigation, groupByMonth } from '../components/TimelineNavigation';
import { queueId3Tag, type ID3Tag } from '../utils/id3';
import { useGlobalContext } from '../GlobalState';
import { BrowseToolbar } from '../components/Browse/BrowseToolbar';
import { BrowseMediaGrid } from '../components/Browse/BrowseMediaGrid';
import { BrowseListView } from '../components/Browse/BrowseListView';
import { BrowseSelectionBar } from '../components/Browse/BrowseSelectionBar';
import { BrowseActionPlanDialog } from '../components/Browse/BrowseActionPlanDialog';
import { useAssetSelection } from '../components/Browse/useAssetSelection';
import { type TimelineItem } from '../components/Browse/browseConstants';
import { useBrowseView } from '../components/Browse/useBrowseView';
import { useCatalogRefresh } from '../components/Browse/useCatalogRefresh';

type TimelineReturnState = { timelineLocationKey?: string };

export default function Timeline() {
  const { user, signEventTemplate, relaysReady } = useNostr();
  const { dispatch } = useGlobalContext();
  const location = useLocation();
  const navigate = useNavigate();
  const timelineLocationKey = (location.state as TimelineReturnState | null)?.timelineLocationKey ?? location.key;
  const status = useCatalogStatus(user?.pubkey);
  const { serverInfo, distribution, rescan } = useServerInfo();
  const knownServersFor = useCallback(
    (sha256: string | undefined) => (sha256 ? (distribution[sha256]?.servers ?? []) : []),
    [distribution]
  );
  const { storeUserServers } = useUserServers();
  const [audioMetadata, setAudioMetadata] = useState<Record<string, ID3Tag>>({});
  const audioProjectionTimer = useRef<number | undefined>(undefined);
  const refresh = useCatalogRefresh(user?.pubkey);
  const { items, setItems, state: projectionState, error: projectionError, retry, version } = refresh;
  const view = useBrowseView({
    timelineLocationKey,
    items,
    ready: projectionState === 'complete',
    version,
    serverInfo,
    pubkey: user?.pubkey,
  });
  const {
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
    lookupError,
    filteredItems,
    clearAllFilters,
    saveBrowseView,
  } = view;

  const [isServerListDialogOpen, setIsServerListDialogOpen] = useState(false);

  const [eventSyncGeneration, setEventSyncGeneration] = useState(0);
  const [activeMonth, setActiveMonth] = useState<string>();
  const [bulkAction, setBulkAction] = useState<CatalogAction>();
  const [cardAction, setCardAction] = useState<{ action: CatalogAction; item: TimelineItem }>();

  // Nothing else in the app pulls the user's own events into the catalog, so without
  // this the timeline only ever holds bare files: "only media with an event" matches
  // nothing, and no title, description or event link ever appears. The relay loaders
  // run on this thread; the worker client bridges them back out.
  const syncedRelayKey = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!user?.pubkey || !relaysReady) return;
    const relayUrls = user.relayUrls ?? [];
    const key = `${user.pubkey}:${relayUrls.join(',')}:${eventSyncGeneration}`;
    if (syncedRelayKey.current === key) return;
    syncedRelayKey.current = key;
    const catalog = getCatalogClient();
    const pubkey = user.pubkey;
    void (async () => {
      const additionalPubkeys = (await catalog.listAdditionalPubkeys(pubkey)) ?? [];
      await syncAuthoredEventsFromRelays(catalog, pubkey, relayUrls);
      for (const source of additionalPubkeys) {
        await syncAdditionalPubkeyFromRelays(catalog, pubkey, source, relayUrls);
      }
      await syncReverseLookupsFromRelays(catalog, pubkey, relayUrls);
    })().catch(() => {
      // Every per-relay failure is already recorded in the catalog's sync runs, and
      // the timeline stays usable from the files it knows about.
    });
  }, [eventSyncGeneration, relaysReady, user?.pubkey, user?.relayUrls]);

  // Files no server ever typed only become recognisable once their first bytes are
  // read - and a playlist among them is what folds hundreds of segments into one
  // item. The sweep is resumable and skips what it has already read, so it is started
  // once per visit and left to converge in the background.
  const sweptPubkey = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!user?.pubkey || projectionState !== 'complete' || sweptPubkey.current === user.pubkey) return;
    sweptPubkey.current = user.pubkey;
    void identifyUnexplainedBlobs(user.pubkey);
  }, [projectionState, user?.pubkey]);

  const orderedAssetIds = useMemo(() => filteredItems.map(item => item.assetId), [filteredItems]);
  const { selectedAssetIds, handleSelectAsset, clearSelection, selectAll } = useAssetSelection(orderedAssetIds);
  const selectedItems = useMemo(
    () => filteredItems.filter(item => selectedAssetIds[item.assetId]),
    [filteredItems, selectedAssetIds]
  );

  const scheduleAudioProjection = () => {
    if (!user?.pubkey) return;
    if (audioProjectionTimer.current !== undefined) window.clearTimeout(audioProjectionTimer.current);
    audioProjectionTimer.current = window.setTimeout(() => {
      const catalog = getCatalogClient();
      void catalog
        .queryCatalogTimeline(user.pubkey)
        .then(setItems)
        .catch(() => undefined);
    }, 200);
  };

  const loadAudioMetadata = (item: TimelineItem) => {
    if (!user?.pubkey || !item.primaryBlobSha256 || !item.primaryUrl) return;
    void queueId3Tag(item.primaryBlobSha256, item.primaryUrl)
      .then(async result => {
        if (!result) return;
        await getCatalogClient().ingestId3(item.primaryBlobSha256!, result.id3);
        setAudioMetadata(current => ({ ...current, [item.primaryBlobSha256!]: result.id3 }));
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

  // The media grid virtualizes its rows, so month jumps and active-month
  // tracking are delegated to it instead of querying the DOM.
  const monthScrollerRef = useRef<(key: string) => void>(() => undefined);
  const registerMonthScroll = useCallback((scroll: (key: string) => void) => {
    monthScrollerRef.current = scroll;
  }, []);
  const scrollToMonth = useCallback((key: string) => monthScrollerRef.current(key), []);

  const handleSaveServers = (newServers: Server[]) => storeUserServers(newServers);

  const handleRescan = useCallback(async () => {
    await rescan();
    setEventSyncGeneration(generation => generation + 1);
  }, [rescan]);

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
    <main className="mx-auto flex w-full max-w-7xl flex-col px-4 pb-8 pt-4">
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
        onRescan={handleRescan}
        eventOnly={eventOnly}
        onEventOnlyChange={setEventOnly}
        groupRepeated={groupDuplicates}
        onGroupRepeatedChange={setGroupDuplicates}
        unlinkedOnly={unlinkedOnly}
        onUnlinkedOnlyChange={setUnlinkedOnly}
        descriptiveOnly={descriptiveOnly}
        onDescriptiveOnlyChange={setDescriptiveOnly}
        availabilityFilter={availabilityFilter}
        onAvailabilityFilterChange={setAvailabilityFilter}
        matchingCount={filteredItems.length}
        knownCount={status?.knownHashes ?? 0}
      />

      {items.length > 0 && projectionState === 'failed' && (
        <div
          className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="status"
        >
          {/* Without this the list silently goes stale: the old items stay on screen
              and nothing says the refresh failed. */}
          <span>Showing your last known media list. Refreshing it failed.</span>
          <Button size="sm" variant="outline" onClick={retry}>
            Try again
          </Button>
        </div>
      )}

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
        <section className="min-w-0 flex-1" aria-label="Your media">
          {displayMode === 'media' ? (
            <BrowseMediaGrid
              knownServersFor={knownServersFor}
              pubkey={user?.pubkey}
              monthGroups={monthGroups}
              filteredItems={filteredItems}
              toFor={assetId => `/browse/${encodeURIComponent(assetId)}`}
              selectedAssetIds={selectedAssetIds}
              onSelect={handleSelectAsset}
              onOpen={openAsset}
              onAudioVisible={loadAudioMetadata}
              onPlayAudio={playAudio}
              onAction={(item, action) => setCardAction({ item, action })}
              onRegisterMonthScroll={registerMonthScroll}
              onActiveMonthChange={setActiveMonth}
            />
          ) : (
            <BrowseListView
              knownServersFor={knownServersFor}
              pubkey={user?.pubkey}
              items={filteredItems}
              toFor={assetId => `/browse/${encodeURIComponent(assetId)}`}
              selectedAssetIds={selectedAssetIds}
              onSelect={handleSelectAsset}
              onOpen={assetId => openAsset(assetId)}
              onAudioVisible={loadAudioMetadata}
            />
          )}
        </section>

        {displayMode === 'media' && (
          <aside className="hidden w-36 shrink-0 lg:block">
            <div className="sticky top-16">
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
        <div>
          <EmptyState
            title="Could not build your media list"
            detail={
              projectionError
                ? `Your catalog is intact; reading it failed: ${projectionError}`
                : 'Your catalog is intact, but reading it failed.'
            }
          />
          <Button className="mt-4" onClick={retry}>
            Try again
          </Button>
        </div>
      )}
      {items.length > 0 && filteredItems.length === 0 && (
        <div>
          <EmptyState
            title="No matching media"
            detail={`None of your ${items.length} items match the current filters.`}
          />
          {/* Describing how to clear filters and not offering it is the trap this
              page kept falling into: the user has to undo each control by hand. */}
          <Button className="mt-4" onClick={clearAllFilters}>
            Clear all filters
          </Button>
        </div>
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
          <h2 className="mt-1 text-xl font-bold">Building your media list</h2>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        Reading event and server-list evidence for {knownHashes.toLocaleString()} known blob
        {knownHashes === 1 ? '' : 's'}.
      </p>
      <div
        className="mt-5 h-2 overflow-hidden border bg-muted"
        role="progressbar"
        aria-label="Updating your media list"
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
