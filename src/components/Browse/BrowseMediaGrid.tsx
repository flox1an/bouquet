import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { MonthGroup } from '../TimelineNavigation';
import { AudioTimelinePreview } from '../AudioTimelinePreview';
import { TimelineThumbnail } from '../TimelineThumbnail';
import { formatDate, formatFileSize } from '../../utils/utils';
import { AVAILABILITY_LABEL, TYPE_ICON, type TimelineItem } from './browseConstants';
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
};

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
}: BrowseMediaGridProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {monthGroups.map((group, groupIndex) => (
        <Fragment key={group.key}>
          <div
            data-month={group.key}
            className="col-span-full mb-1 flex items-center gap-3"
            style={{ marginTop: groupIndex > 0 ? '1rem' : 0 }}
          >
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-muted-foreground">{group.label}</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          {filteredItems
            .filter(item => {
              const d = new Date(item.displayDate);
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              return key === group.key;
            })
            .map(item => {
              const Icon = TYPE_ICON[item.displayType];
              const dateLabel =
                item.displayDateSource === 'event'
                  ? 'Published'
                  : item.displayDateSource === 'blob-uploaded'
                    ? 'Uploaded'
                    : 'Discovered';
              return (
                <article
                  key={item.assetId}
                  data-asset-id={item.assetId}
                  className="group relative border bg-card p-3 shadow-[3px_3px_0_hsl(var(--border))] transition-transform hover:-translate-y-0.5"
                >
                  <Checkbox
                    checked={!!selectedAssetIds[item.assetId]}
                    onCheckedChange={() => onSelect(item.assetId)}
                    onClick={event => event.stopPropagation()}
                    aria-label={`Select ${item.displayTitle}`}
                    className="absolute left-2 top-2 z-10 bg-background"
                  />
                  <Link
                    to={toFor(item.assetId)}
                    onClick={event =>
                      onOpen(item.assetId, event.currentTarget.closest('article')?.getBoundingClientRect().top)
                    }
                    className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    aria-label={`Open details for ${item.displayTitle}`}
                  >
                    {item.displayType === 'audio' ? (
                      <AudioTimelinePreview
                        item={item}
                        metadataVersion={audioMetadataVersion[item.assetId]}
                        sourceUrl={item.primaryUrl}
                        onVisible={() => onAudioVisible(item)}
                      />
                    ) : (
                      <TimelineThumbnail item={item} />
                    )}
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
                      {dateLabel} {formatDate(item.displayDate)} · {item.replicaCount} replica
                      {item.replicaCount === 1 ? '' : 's'}
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {item.blobCount} blob{item.blobCount === 1 ? '' : 's'} · {formatFileSize(item.totalBlobSize)}
                      {item.unknownBlobSizeCount > 0 && ` · ${item.unknownBlobSizeCount} size unknown`}
                    </p>
                    {item.displaySubtitle && (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.displaySubtitle}</p>
                    )}
                    {!item.eventId && <p className="mt-1 text-[11px] text-muted-foreground">No linked Nostr event</p>}
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
            })}
        </Fragment>
      ))}
    </div>
  );
}
