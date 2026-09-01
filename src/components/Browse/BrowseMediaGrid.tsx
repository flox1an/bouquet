import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { MonthGroup } from '../TimelineNavigation';
import { AudioTimelinePreview } from '../AudioTimelinePreview';
import { TimelineThumbnail, type KnownServersFor } from '../TimelineThumbnail';
import { useNativeUrlAvailabilityCheck } from './useNativeUrlAvailability';
import { formatDate, formatFileSize } from '../../utils/utils';
import { AVAILABILITY_LABEL, TYPE_ICON, type TimelineItem } from './browseConstants';
import { eventKindLabel } from '../../catalog/eventKinds';
import type { CatalogAction } from '../../catalog/advanced';

type BrowseMediaGridProps = {
  monthGroups: MonthGroup[];
  filteredItems: TimelineItem[];
  toFor: (assetId: string) => string;
  selectedAssetIds: Record<string, boolean>;
  onSelect: (assetId: string, event?: React.MouseEvent<HTMLElement> | React.ChangeEvent<HTMLInputElement>) => void;
  onOpen: (assetId: string, anchorOffset?: number) => void;
  audioMetadataVersion: Record<string, number>;
  onAudioVisible: (item: TimelineItem) => void;
  onPlayAudio: (item: TimelineItem) => void;
  onAction: (item: TimelineItem, action: CatalogAction) => void;
  /** Registers a jump-to-month function; headers are virtualized, so month
      navigation must go through the virtualizer instead of the DOM. */
  onRegisterMonthScroll: (scrollToMonth: (key: string) => void) => void;
  onActiveMonthChange: (key: string) => void;
  knownServersFor?: KnownServersFor;
  pubkey?: string;
};

// Must match the grid's sm/md/lg breakpoints so column width stays honest.
function columnCountFor(width: number): number {
  if (width >= 1024) return 4;
  if (width >= 768) return 3;
  if (width >= 640) return 2;
  return 1;
}

function useColumnCount(): number {
  // renderToString environments (vocabulary tests) have no window; default wide.
  const [columns, setColumns] = useState(() => columnCountFor(typeof window === 'undefined' ? 1024 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setColumns(columnCountFor(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return columns;
}

type Row = { type: 'header'; key: string; label: string } | { type: 'cards'; key: string; items: TimelineItem[] };

/** The grid mounts only the rows near the viewport: rendering 5 000+ cards on
    every keystroke froze the tab for seconds (each card pulls thumbnails and
    dozens of components). Rows keep their DOM node across filters via key, so
    already-mounted cards are not re-fetched. */
function useVirtualRows(monthGroups: MonthGroup[], itemsByMonth: Map<string, TimelineItem[]>, columns: number): Row[] {
  return useMemo(() => {
    const rows: Row[] = [];
    for (const group of monthGroups) {
      rows.push({ type: 'header', key: `header:${group.key}`, label: group.label });
      const items = itemsByMonth.get(group.key) ?? [];
      for (let i = 0; i < items.length; i += columns) {
        rows.push({ type: 'cards', key: `cards:${group.key}:${i}`, items: items.slice(i, i + columns) });
      }
    }
    return rows;
  }, [monthGroups, itemsByMonth, columns]);
}

function groupKeyOf(item: TimelineItem): string {
  const date = new Date(item.displayDate);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function BrowseMediaGrid({
  monthGroups,
  filteredItems,
  toFor,
  selectedAssetIds,
  onSelect,
  onOpen,
  audioMetadataVersion,
  onAudioVisible,
  onPlayAudio,
  onAction,
  onRegisterMonthScroll,
  onActiveMonthChange,
  knownServersFor,
  pubkey,
}: BrowseMediaGridProps) {
  const columns = useColumnCount();
  const containerRef = useRef<HTMLDivElement>(null);

  // Grouping once is O(items). The previous code re-scanned every item for every
  // month, so a year of media cost twelve full passes and a Date per item per
  // pass, on every render.
  const itemsByMonth = useMemo(() => {
    const groups = new Map<string, TimelineItem[]>();
    for (const item of filteredItems) {
      const key = groupKeyOf(item);
      const bucket = groups.get(key);
      if (bucket) bucket.push(item);
      else groups.set(key, [item]);
    }
    return groups;
  }, [filteredItems]);

  const rows = useVirtualRows(monthGroups, itemsByMonth, columns);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: index => (rows[index].type === 'header' ? 36 : 340),
    overscan: 4,
    scrollMargin: containerRef.current?.offsetTop ?? 0,
    getItemKey: index => rows[index].key,
    // Without a rect the virtualizer renders nothing, which is what a server
    // render and the first client render before measurement both see.
    initialRect: { width: 1280, height: 900 },
  });
  const scrollToMonth = useCallback(
    (key: string) => {
      const index = rows.findIndex(row => row.type === 'header' && row.key === `header:${key}`);
      if (index >= 0) virtualizer.scrollToIndex(index, { align: 'start' });
    },
    [rows, virtualizer]
  );
  useEffect(() => onRegisterMonthScroll(scrollToMonth), [onRegisterMonthScroll, scrollToMonth]);

  const virtualItems = virtualizer.getVirtualItems();

  // The active month is the last header above the viewport. Headers outside the
  // virtual range have no DOM node, so this reads the virtualizer's measurements
  // instead of observing [data-month] elements.
  const activeMonth = useMemo(() => {
    const viewportTop = (typeof window === 'undefined' ? 0 : window.scrollY) - (containerRef.current?.offsetTop ?? 0) + 80;
    let current: string | undefined;
    for (const measurement of virtualizer.measurementsCache) {
      if (measurement.start > viewportTop) break;
      const row = rows[measurement.index];
      if (row.type === 'header') current = row.key.replace('header:', '');
    }
    return current;
    // virtualItems changes whenever scrolling moves the rendered range.
  }, [rows, virtualizer, virtualItems]);
  useEffect(() => {
    if (activeMonth) onActiveMonthChange(activeMonth);
  }, [activeMonth, onActiveMonthChange]);

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {virtualItems.map(virtualItem => {
        const row = rows[virtualItem.index];
        if (row.type === 'header') {
          return (
            <div
              key={virtualItem.key}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              className="absolute left-0 top-0 flex w-full items-center gap-3 pt-3"
              style={{ transform: `translateY(${virtualItem.start - virtualizer.options.scrollMargin}px)` }}
            >
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {row.label}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
          );
        }
        return (
          <div
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            className="absolute left-0 top-0 grid w-full gap-2 py-1"
            style={{
              transform: `translateY(${virtualItem.start - virtualizer.options.scrollMargin}px)`,
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            }}
          >
            {row.items.map(item => (
              <MediaCard
                key={item.assetId}
                item={item}
                toFor={toFor}
                selected={!!selectedAssetIds[item.assetId]}
                onSelect={onSelect}
                onOpen={onOpen}
                metadataVersion={audioMetadataVersion[item.assetId]}
                onAudioVisible={onAudioVisible}
                onPlayAudio={onPlayAudio}
                onAction={onAction}
                knownServersFor={knownServersFor}
                pubkey={pubkey}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function MediaCard({
  item,
  toFor,
  selected,
  onSelect,
  onOpen,
  metadataVersion,
  onAudioVisible,
  onPlayAudio,
  onAction,
  knownServersFor,
  pubkey,
}: {
  item: TimelineItem;
  toFor: (assetId: string) => string;
  selected: boolean;
  onSelect: BrowseMediaGridProps['onSelect'];
  onOpen: BrowseMediaGridProps['onOpen'];
  metadataVersion: number | undefined;
  onAudioVisible: (item: TimelineItem) => void;
  onPlayAudio: (item: TimelineItem) => void;
  onAction: (item: TimelineItem, action: CatalogAction) => void;
  knownServersFor?: KnownServersFor;
  pubkey?: string;
}) {
  useNativeUrlAvailabilityCheck(pubkey, item);
  const Icon = TYPE_ICON[item.displayType];
  const dateLabel =
    item.displayDateSource === 'event'
      ? 'Published'
      : item.displayDateSource === 'blob-uploaded'
        ? 'Uploaded'
        : 'Discovered';
  const availabilityClass =
    item.availabilityState === 'complete'
      ? 'bg-primary'
      : item.availabilityState === 'partial'
        ? 'bg-yellow-500'
        : item.availabilityState === 'unavailable'
          ? 'bg-destructive'
          : 'bg-muted-foreground';
  return (
    <article
      data-asset-id={item.assetId}
      className="group relative border bg-card p-3 shadow-[3px_3px_0_hsl(var(--border))] transition-transform hover:-translate-y-0.5"
    >
      <Checkbox
        checked={selected}
        onCheckedChange={() => onSelect(item.assetId)}
        onClick={event => event.stopPropagation()}
        aria-label={`Select ${item.displayTitle}`}
        className="absolute left-2 top-2 z-10 bg-background"
      />
      <Link
        to={toFor(item.assetId)}
        onClick={event => onOpen(item.assetId, event.currentTarget.closest('article')?.getBoundingClientRect().top)}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={`Open details for ${item.displayTitle}`}
      >
        {item.displayType === 'audio' ? (
          <AudioTimelinePreview
            item={item}
            metadataVersion={metadataVersion}
            sourceUrl={item.primaryUrl}
            onVisible={() => onAudioVisible(item)}
          />
        ) : (
          <TimelineThumbnail item={item} knownServersFor={knownServersFor} />
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-primary bg-primary/10">
            <Icon className="h-4 w-4" />
          </div>
          <div className="flex items-center gap-1.5">
            <span
              role="img"
              className={`h-2 w-2 shrink-0 border border-foreground/30 ${availabilityClass}`}
              title={AVAILABILITY_LABEL[item.availabilityState]}
              aria-label={AVAILABILITY_LABEL[item.availabilityState]}
            />
            <span
              className={`border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${
                item.eventId ? 'border-primary text-foreground' : 'border-muted-foreground/50 text-muted-foreground'
              }`}
            >
              {eventKindLabel(item.eventKind)}
            </span>
          </div>
        </div>
        <h2
          className={`mt-2 truncate text-sm font-semibold ${
            item.displayTitleIsFallback ? 'italic text-muted-foreground' : ''
          }`}
        >
          {item.displayTitle}
        </h2>
        {item.displaySubtitle && <p className="mt-1 line-clamp-2 text-xs text-foreground/80">{item.displaySubtitle}</p>}
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          {dateLabel} {formatDate(item.displayDate)} · {item.blobCount === 1 ? '1 file' : `${item.blobCount} files`} ·{' '}
          {formatFileSize(item.totalBlobSize)}
          {item.unknownBlobSizeCount > 0 && ` · ${item.unknownBlobSizeCount} size unknown`}
        </p>
      </Link>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {item.displayType === 'audio' && (
          <Button
            size="sm"
            variant="secondary"
            disabled={!item.primaryUrl}
            onClick={() => onPlayAudio(item)}
            aria-label={`Play ${item.displayTitle}`}
          >
            <Play className="h-4 w-4" />
            Play
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => onAction(item, 'mirror')}>
          Mirror
        </Button>
        <Button size="sm" variant="outline" onClick={() => onAction(item, 'sync')}>
          Sync
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onAction(item, 'delete')}>
          Delete
        </Button>
      </div>
    </article>
  );
}
