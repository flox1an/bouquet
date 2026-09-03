import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MoreVertical, Play } from 'lucide-react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { MonthGroup } from '../TimelineNavigation';
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

// Column widths are set inline from this table, so it is the single source of
// truth for grid density. Cards are compact enough that a thumbnail still reads
// at these widths.
function columnCountFor(width: number): number {
  if (width >= 1536) return 6;
  if (width >= 1024) return 5;
  if (width >= 768) return 4;
  if (width >= 640) return 3;
  return 2;
}

function useColumnCount(): number {
  // renderToString environments (vocabulary tests) have no window; default wide.
  const [columns, setColumns] = useState(() =>
    columnCountFor(typeof window === 'undefined' ? 1024 : window.innerWidth)
  );
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

  // Exact row estimates keep long-range month jumps honest: the jump scrolls
  // to an offset computed from these estimates, and rows skipped by the jump
  // never mount, so they are never measured — every pixel of estimate error
  // accumulates over the skipped distance. Card rows are py-1 (8px) plus a
  // square card of the grid track width; headers are pt-3 (12px) plus a
  // text-xs line (16px).
  const containerWidth = containerRef.current?.clientWidth ?? 1280;
  const cardRowSize = 8 + (containerWidth - (columns - 1) * 8) / columns;

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: index => (rows[index].type === 'header' ? 28 : cardRowSize),
    scrollMargin: containerRef.current?.offsetTop ?? 0,
    getItemKey: index => rows[index].key,
    // Without a rect the virtualizer renders nothing, which is what a server
    // render and the first client render before measurement both see.
    initialRect: { width: 1280, height: 900 },
  });
  const scrollToMonth = useCallback(
    (key: string) => {
      const index = rows.findIndex(row => row.type === 'header' && row.key === `header:${key}`);
      if (index < 0) return;
      // 'instant' overrides the html-wide scroll-behavior: smooth, whose
      // animation would crawl over thousands of rows while the virtualizer
      // re-mounts card ranges the whole way.
      virtualizer.scrollToIndex(index, { align: 'start', behavior: 'instant' });
      // Re-align once the target header is mounted: land it below the sticky
      // TopNav (h-14 + border). The delta is viewport-relative; anchoring it to
      // the container rect instead scrolled by the header's whole distance from
      // the container start and clamped every jump to the bottom of the list.
      // Measurements keep settling for a few frames after the instant jump, so
      // the alignment repeats until the header sits still at the nav's edge.
      let frames = 0;
      const settle = () => {
        const header = containerRef.current?.querySelector<HTMLElement>(`[data-month-header="${key}"]`);
        if (!header || frames++ > 8) return;
        const delta = header.getBoundingClientRect().top - 64;
        if (Math.abs(delta) <= 1) return;
        window.scrollBy({ top: delta, behavior: 'instant' });
        requestAnimationFrame(settle);
      };
      requestAnimationFrame(settle);
    },
    [rows, virtualizer]
  );
  useEffect(() => onRegisterMonthScroll(scrollToMonth), [onRegisterMonthScroll, scrollToMonth]);

  const virtualItems = virtualizer.getVirtualItems();

  // The active month is the last header above the viewport. Headers outside the
  // virtual range have no DOM node, so this reads the virtualizer's measurements
  // instead of observing [data-month] elements.
  const activeMonth = useMemo(() => {
    const viewportTop =
      (typeof window === 'undefined' ? 0 : window.scrollY) - (containerRef.current?.offsetTop ?? 0) + 80;
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
              data-month-header={row.key.replace('header:', '')}
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

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60) % 60;
  const rest = String(total % 60).padStart(2, '0');
  const hours = Math.floor(total / 3600);
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/** A 43-file HLS video is one playlist plus 42 segments the user never chose;
    counting them all as "43 files" reads as 43 uploads. */
function fileSummary(item: TimelineItem): string {
  const segments = item.segmentCount ?? 0;
  if (segments <= 0) return plural(item.blobCount, 'file');
  const rest = item.blobCount - segments;
  if (rest <= 0) return plural(segments, 'segment');
  return `${rest === 1 ? '1 playlist' : plural(rest, 'file')} + ${plural(segments, 'segment')}`;
}

const OVERLAY_BADGE =
  'pointer-events-none border border-border bg-background/85 px-1 py-px font-mono text-[10px] leading-4 tracking-wide';

function MediaCard({
  item,
  toFor,
  selected,
  onSelect,
  onOpen,
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
  onAudioVisible: (item: TimelineItem) => void;
  onPlayAudio: (item: TimelineItem) => void;
  onAction: (item: TimelineItem, action: CatalogAction) => void;
  knownServersFor?: KnownServersFor;
  pubkey?: string;
}) {
  useNativeUrlAvailabilityCheck(pubkey, item);
  // The virtualizer mounts cards only near the viewport, so mount is the
  // visibility signal; the id3 cache turns any remount into a no-op.
  const audioRequested = useRef(false);
  useEffect(() => {
    if (audioRequested.current || item.displayType !== 'audio') return;
    audioRequested.current = true;
    onAudioVisible(item);
  }, [item, onAudioVisible]);
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
  // When the title is only the kind label, the meta line would repeat it.
  const meta = [
    item.displayTitleIsFallback ? undefined : item.displayKindLabel,
    formatFileSize(item.totalBlobSize),
    item.displayDimensions,
    fileSummary(item),
  ]
    .filter(Boolean)
    .join(' · ');
  const shortHash = item.displayTitleIsFallback ? item.primaryBlobSha256?.slice(0, 8) : undefined;
  const segments = item.segmentCount ?? 0;
  return (
    <article
      data-asset-id={item.assetId}
      className="group relative aspect-square overflow-hidden bg-muted transition-transform hover:-translate-y-0.5"
    >
      <Link
        to={toFor(item.assetId)}
        onClick={event => {
          if (event.shiftKey) {
            event.preventDefault();
            onSelect(item.assetId, event);
            return;
          }
          onOpen(item.assetId, event.currentTarget.closest('article')?.getBoundingClientRect().top);
        }}
        className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        aria-label={`Open details for ${item.displayTitle}`}
      >
        <TimelineThumbnail item={item} knownServersFor={knownServersFor} fill />
        {/* Kind first: at column width the line truncates, and losing the clock
            time costs less than losing "Unlinked file". */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pb-1.5 pt-10">
          <div className="flex items-baseline gap-1.5">
            <Icon className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-white/70" aria-hidden="true" />
            <h2
              className={`truncate text-sm text-white ${item.displayTitleIsFallback ? 'font-medium' : 'font-semibold'}`}
            >
              {item.displayTitle}
            </h2>
            {shortHash && <span className="shrink-0 font-mono text-[10px] text-white/60">{shortHash}</span>}
          </div>
          {item.displaySubtitle && <p className="truncate text-xs text-white/80">{item.displaySubtitle}</p>}
          <p
            className="truncate font-mono text-[10px] leading-4 text-white/60"
            title={
              item.unknownBlobSizeCount > 0 ? `${plural(item.unknownBlobSizeCount, 'file')} of unknown size` : undefined
            }
          >
            {[eventKindLabel(item.eventKind), meta, `${dateLabel} ${formatDate(item.displayDate)}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </Link>
      {/* Overlay layer over the full-bleed square preview: keeps the controls
          off the text gradient without nesting buttons inside the link. */}
      <div className="pointer-events-none absolute inset-0">
        <Checkbox
          checked={selected}
          onClick={event => {
            event.stopPropagation();
            onSelect(item.assetId, event);
          }}
          aria-label={`Select ${item.displayTitle}`}
          className="pointer-events-auto absolute left-1 top-1 bg-background"
        />
        <div className="absolute right-1 top-1 flex items-center gap-1">
          {segments > 0 && <span className={OVERLAY_BADGE}>HLS · {plural(segments, 'segment')}</span>}
          {item.displayDurationSeconds !== undefined && (
            <span className={OVERLAY_BADGE}>{formatDuration(item.displayDurationSeconds)}</span>
          )}
          <span className="flex h-4 w-4 items-center justify-center border border-border bg-background/85">
            <span
              role="img"
              className={`h-2 w-2 shrink-0 border border-foreground/30 ${availabilityClass}`}
              title={AVAILABILITY_LABEL[item.availabilityState]}
              aria-label={AVAILABILITY_LABEL[item.availabilityState]}
            />
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="secondary"
                className="pointer-events-auto h-6 w-6 border border-border opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
              >
                <MoreVertical className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only">Actions for {item.displayTitle}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onAction(item, 'mirror')}>Mirror</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onAction(item, 'sync')}>Sync</DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onAction(item, 'delete')}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {item.displayType === 'audio' && (
          <Button
            size="icon"
            variant="secondary"
            disabled={!item.primaryUrl}
            onClick={() => onPlayAudio(item)}
            aria-label={`Play ${item.displayTitle}`}
            className="pointer-events-auto absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 border border-border shadow-[2px_2px_0_hsl(var(--border))]"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </article>
  );
}
