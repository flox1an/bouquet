import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Checkbox } from '@/components/ui/checkbox';
import { getCatalog } from '../../catalog/catalog';
import { getCatalogTimelineAsset, type TimelineAssetDetail } from '../../catalog/advanced';
import { TimelineThumbnail } from '../TimelineThumbnail';
import { AudioTimelinePreview } from '../AudioTimelinePreview';
import { formatDate, formatFileSize } from '../../utils/utils';
import { AVAILABILITY_LABEL, TYPE_ICON, type TimelineItem } from './browseConstants';

type BrowseListRowProps = {
  item: TimelineItem;
  pubkey: string;
  to: string;
  selected: boolean;
  onSelect: (assetId: string, event?: React.MouseEvent<HTMLElement> | React.ChangeEvent<HTMLInputElement>) => void;
  onOpen: () => void;
  audioMetadataVersion?: number;
  onAudioVisible: () => void;
};

export function BrowseListRow({
  item,
  pubkey,
  to,
  selected,
  onSelect,
  onOpen,
  audioMetadataVersion,
  onAudioVisible,
}: BrowseListRowProps) {
  const Icon = TYPE_ICON[item.displayType];
  const dateLabel =
    item.displayDateSource === 'event' ? 'Published' : item.displayDateSource === 'blob-uploaded' ? 'Uploaded' : 'Discovered';
  const [detail, setDetail] = useState<TimelineAssetDetail>();
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
            void getCatalogTimelineAsset(getCatalog(), pubkey, item.assetId).then(result => {
              if (result) setDetail(result);
            });
            observer.disconnect();
          }
        }
      },
      { rootMargin: '200px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [item.assetId, pubkey]);

  return (
    <div ref={rootRef} data-asset-id={item.assetId} className="border bg-card p-3 shadow-[3px_3px_0_hsl(var(--border))]">
      <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_minmax(18rem,0.9fr)]">
        <Checkbox
          checked={selected}
          onCheckedChange={() => onSelect(item.assetId)}
          onClick={event => event.stopPropagation()}
          aria-label={`Select ${item.displayTitle}`}
          className="mt-1 self-start"
        />
        <Link
          to={to}
          onClick={onOpen}
          className="grid min-w-0 gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background md:grid-cols-[8rem_minmax(0,1fr)]"
          aria-label={`Open details for ${item.displayTitle}`}
        >
          <div className="w-full sm:w-32">
            {item.displayType === 'audio' ? (
              <AudioTimelinePreview
                item={item}
                metadataVersion={audioMetadataVersion}
                sourceUrl={item.primaryUrl}
                onVisible={onAudioVisible}
              />
            ) : (
              <TimelineThumbnail item={item} />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-primary bg-primary/10">
                <Icon className="h-4 w-4" />
              </div>
              <div className="text-right font-mono text-[10px] uppercase text-muted-foreground">
                <p>{item.displayType}</p>
                <p>{AVAILABILITY_LABEL[item.availabilityState]}</p>
              </div>
            </div>
            <h2 className="mt-2 truncate text-sm font-semibold">{item.displayTitle}</h2>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {dateLabel} {formatDate(item.displayDate)} · {item.replicaCount} replica{item.replicaCount === 1 ? '' : 's'}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {item.blobCount} blob{item.blobCount === 1 ? '' : 's'} · {formatFileSize(item.totalBlobSize)}
              {item.unknownBlobSizeCount > 0 && ` · ${item.unknownBlobSizeCount} size unknown`}
            </p>
            {item.displaySubtitle && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.displaySubtitle}</p>}
            {!item.eventId && <p className="mt-1 text-[11px] text-muted-foreground">No linked Nostr event</p>}
          </div>
        </Link>
        <BlobSummary detail={detail} fallback={item} />
      </div>
    </div>
  );
}

function BlobSummary({ detail, fallback }: { detail?: TimelineAssetDetail; fallback: TimelineItem }) {
  if (!detail) {
    return (
      <div className="border-t pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Asset contents</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {fallback.blobCount} blob{fallback.blobCount === 1 ? '' : 's'} · {formatFileSize(fallback.totalBlobSize)}
        </p>
      </div>
    );
  }

  const visibleBlobs = detail.blobs.slice(0, 4);
  const remaining = detail.blobs.length - visibleBlobs.length;

  return (
    <div className="border-t pt-3 md:border-l md:border-t-0 md:pl-4 md:pt-0">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Asset contents</p>
        <p className="font-mono text-[11px] text-muted-foreground">
          {detail.blobs.length} blob{detail.blobs.length === 1 ? '' : 's'}
        </p>
      </div>
      <ul className="mt-2 space-y-2">
        {visibleBlobs.map(blob => (
          <li key={`${blob.sha256}:${blob.role}:${blob.ordinal}`} className="min-w-0 border bg-muted/25 px-2 py-1.5">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate font-mono text-xs">{blob.sha256}</p>
              <p className="shrink-0 font-mono text-[10px] uppercase text-muted-foreground">{blob.role}</p>
            </div>
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              {blob.eventMimeType ?? blob.mimeType ?? 'Unknown MIME'} ·{' '}
              {blob.size !== undefined ? formatFileSize(blob.size) : 'Unknown size'} · {blob.replicaCount} replica
              {blob.replicaCount === 1 ? '' : 's'}
            </p>
          </li>
        ))}
      </ul>
      {remaining > 0 && (
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">+{remaining} related blob{remaining === 1 ? '' : 's'}</p>
      )}
    </div>
  );
}
