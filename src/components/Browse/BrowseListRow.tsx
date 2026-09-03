import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Checkbox } from '@/components/ui/checkbox';
import { getCatalogClient } from '../../catalog/catalogClient';
import type { TimelineAssetContents } from '../../catalog/advanced';
import { TimelineThumbnail, type KnownServersFor } from '../TimelineThumbnail';
import { useNativeUrlAvailabilityCheck } from './useNativeUrlAvailability';
import { formatDate, formatFileSize } from '../../utils/utils';
import { AVAILABILITY_LABEL, TYPE_ICON, type TimelineItem } from './browseConstants';
import { eventKindLabel } from '../../catalog/eventKinds';

const VISIBLE_BLOB_COUNT = 4;

type BrowseListRowProps = {
  item: TimelineItem;
  to: string;
  selected: boolean;
  onSelect: (assetId: string, event?: React.MouseEvent<HTMLElement> | React.ChangeEvent<HTMLInputElement>) => void;
  onOpen: () => void;
  onAudioVisible: () => void;
  knownServersFor?: KnownServersFor;
  pubkey?: string;
};

export function BrowseListRow({
  item,
  to,
  selected,
  onSelect,
  onOpen,
  onAudioVisible,
  knownServersFor,
  pubkey,
}: BrowseListRowProps) {
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
  const [contents, setContents] = useState<TimelineAssetContents>();
  const rootRef = useRef<HTMLDivElement>(null);
  const hasRequested = useRef(false);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || hasRequested.current) return;
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting && !hasRequested.current) {
            hasRequested.current = true;
            void getCatalogClient()
              .getCatalogAssetContents(item.assetId, VISIBLE_BLOB_COUNT)
              .then(setContents)
              .catch(() => undefined); // Row already renders from the projection.
            observer.disconnect();
          }
        }
      },
      { rootMargin: '200px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
    // The asset id already carries the profile, so no pubkey is needed to scope it.
  }, [item.assetId]);

  // Rows mount only near the viewport (the list is virtualized), so mount is
  // the visibility signal; the id3 cache turns any remount into a no-op.
  const audioRequested = useRef(false);
  useEffect(() => {
    if (audioRequested.current || item.displayType !== 'audio') return;
    audioRequested.current = true;
    onAudioVisible();
  }, [item, onAudioVisible]);

  return (
    <div
      ref={rootRef}
      data-asset-id={item.assetId}
      className="border bg-card p-3 shadow-[3px_3px_0_hsl(var(--border))]"
    >
      <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_minmax(18rem,0.9fr)]">
        <Checkbox
          checked={selected}
          onClick={event => {
            event.stopPropagation();
            onSelect(item.assetId, event);
          }}
          aria-label={`Select ${item.displayTitle}`}
          className="mt-1 self-start"
        />
        <Link
          to={to}
          onClick={event => {
            if (event.shiftKey) {
              event.preventDefault();
              onSelect(item.assetId, event);
              return;
            }
            onOpen();
          }}
          className="grid min-w-0 gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:grid-cols-[8rem_minmax(0,1fr)]"
          aria-label={`Open details for ${item.displayTitle}`}
        >
          <div className="w-full sm:w-32">
            <TimelineThumbnail item={item} knownServersFor={knownServersFor} />
          </div>
          <div className="min-w-0">
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
            {item.displaySubtitle && (
              <p className="mt-1 line-clamp-2 text-xs text-foreground/80">{item.displaySubtitle}</p>
            )}
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              {dateLabel} {formatDate(item.displayDate)} · {item.blobCount === 1 ? '1 file' : `${item.blobCount} files`}{' '}
              · {formatFileSize(item.totalBlobSize)}
              {item.unknownBlobSizeCount > 0 && ` · ${item.unknownBlobSizeCount} size unknown`} · {item.replicaCount}{' '}
              {item.replicaCount === 1 ? 'copy' : 'copies'}
            </p>
          </div>
        </Link>
        <BlobSummary contents={contents} fallback={item} />
      </div>
    </div>
  );
}

function BlobSummary({ contents, fallback }: { contents?: TimelineAssetContents; fallback: TimelineItem }) {
  // Until the contents load, the projection's own counts stand in. They can lag a
  // manifest expansion, so once the real count arrives it wins.
  const total = contents?.totalCount ?? fallback.blobCount;
  const fileLabel = total === 1 ? '1 file' : `${total} files`;

  if (!contents) {
    return (
      <div className="border-t pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Item contents</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {fileLabel} · {formatFileSize(fallback.totalBlobSize)}
        </p>
      </div>
    );
  }

  const remaining = total - contents.blobs.length;

  return (
    <div className="border-t pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Item contents</p>
        <p className="font-mono text-[11px] text-muted-foreground">{fileLabel}</p>
      </div>
      <ul className="mt-2 space-y-2">
        {contents.blobs.map(blob => (
          <li key={`${blob.sha256}:${blob.role}:${blob.ordinal}`} className="min-w-0 border bg-muted/25 px-2 py-1.5">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate font-mono text-xs">{blob.sha256}</p>
              <p className="shrink-0 font-mono text-[10px] uppercase text-muted-foreground">{blob.role}</p>
            </div>
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              {blob.eventMimeType ?? blob.mimeType ?? 'Unknown MIME'} ·{' '}
              {blob.size !== undefined ? formatFileSize(blob.size) : 'Unknown size'} · {blob.replicaCount}{' '}
              {blob.replicaCount === 1 ? 'copy' : 'copies'}
            </p>
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
          {remaining === 1 ? '+1 related file' : `+${remaining} related files`}
        </p>
      )}
    </div>
  );
}
