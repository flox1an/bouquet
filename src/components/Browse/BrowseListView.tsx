import { useRef } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { BrowseListRow } from './BrowseListRow';
import type { KnownServersFor } from '../TimelineThumbnail';
import type { TimelineItem } from './browseConstants';

type BrowseListViewProps = {
  items: TimelineItem[];
  toFor: (assetId: string) => string;
  selectedAssetIds: Record<string, boolean>;
  onSelect: (assetId: string, event?: React.MouseEvent<HTMLElement> | React.ChangeEvent<HTMLInputElement>) => void;
  onOpen: (assetId: string) => void;
  onAudioVisible: (item: TimelineItem) => void;
  knownServersFor?: KnownServersFor;
  pubkey?: string;
};

export function BrowseListView({
  items,
  toFor,
  selectedAssetIds,
  onSelect,
  onOpen,
  onAudioVisible,
  knownServersFor,
  pubkey,
}: BrowseListViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => 180,
    overscan: 6,
    scrollMargin: containerRef.current?.offsetTop ?? 0,
    getItemKey: index => items[index].assetId,
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
      {virtualItems.map(virtualItem => {
        const item = items[virtualItem.index];
        return (
          <div
            key={virtualItem.key}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            className="absolute left-0 top-0 w-full pb-3"
            style={{ transform: `translateY(${virtualItem.start - virtualizer.options.scrollMargin}px)` }}
          >
            <BrowseListRow
              item={item}
              to={toFor(item.assetId)}
              selected={!!selectedAssetIds[item.assetId]}
              onSelect={onSelect}
              onOpen={() => onOpen(item.assetId)}
              onAudioVisible={() => onAudioVisible(item)}
              knownServersFor={knownServersFor}
              pubkey={pubkey}
            />
          </div>
        );
      })}
    </div>
  );
}
