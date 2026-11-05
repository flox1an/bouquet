import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Checkbox } from '@/components/ui/checkbox';
import { TimelineThumbnail, type KnownServersFor } from '../TimelineThumbnail';
import { useNativeUrlAvailabilityCheck } from './useNativeUrlAvailability';
import { formatDate, formatFileSize } from '../../utils/utils';
import {
  AVAILABILITY_CLASS,
  AVAILABILITY_ICON,
  AVAILABILITY_LABEL,
  TYPE_ICON,
  type TimelineItem,
} from './browseConstants';
import { eventKindLabel } from '../../catalog/eventKinds';

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
  const AvailabilityIcon = AVAILABILITY_ICON[item.availabilityState];
  const availabilityLabel = AVAILABILITY_LABEL[item.availabilityState];

  // Rows mount only near the viewport (the list is virtualized), so mount is
  // the visibility signal; the id3 cache turns any remount into a no-op.
  const audioRequested = useRef(false);
  useEffect(() => {
    if (audioRequested.current || item.displayType !== 'audio') return;
    audioRequested.current = true;
    onAudioVisible();
  }, [item, onAudioVisible]);

  return (
    <div data-asset-id={item.assetId} className="border bg-card p-3 shadow-[3px_3px_0_hsl(var(--border))]">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
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
                <Icon className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="flex items-center gap-1.5">
                <span role="img" aria-label={availabilityLabel} title={availabilityLabel}>
                  <AvailabilityIcon
                    className={`h-4 w-4 ${AVAILABILITY_CLASS[item.availabilityState]}`}
                    aria-hidden="true"
                  />
                </span>
                <span
                  className={`border px-1.5 py-0.5 font-mono text-xs uppercase tracking-wide ${
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
              title={item.displayTitleIsFallback ? item.primaryBlobSha256 : undefined}
            >
              {item.displayTitle}
            </h2>
            {item.displaySubtitle && (
              <p className="mt-1 line-clamp-2 text-xs text-foreground/80">{item.displaySubtitle}</p>
            )}
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {dateLabel} {formatDate(item.displayDate)} · {item.blobCount === 1 ? '1 file' : `${item.blobCount} files`}{' '}
              · {formatFileSize(item.totalBlobSize)}
              {item.unknownBlobSizeCount > 0 && ` · ${item.unknownBlobSizeCount} of unknown size`} ·{' '}
              {item.replicaCount} {item.replicaCount === 1 ? 'copy' : 'copies'}
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
