import { CheckSquare, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatFileSize } from '../../utils/utils';
import type { CatalogAction } from '../../catalog/advanced';
import type { TimelineItem } from './browseConstants';

type BrowseSelectionBarProps = {
  selectedItems: TimelineItem[];
  onSelectAllVisible: () => void;
  onClear: () => void;
  onAction: (action: CatalogAction) => void;
};

export function BrowseSelectionBar({ selectedItems, onSelectAllVisible, onClear, onAction }: BrowseSelectionBarProps) {
  if (selectedItems.length === 0) return null;
  const totalSize = selectedItems.reduce((sum, item) => sum + item.totalBlobSize, 0);
  const totalBlobs = selectedItems.reduce((sum, item) => sum + item.blobCount, 0);

  return (
    <div
      className="sticky top-2 z-20 mb-4 flex flex-wrap items-center gap-3 border bg-card px-4 py-2.5 shadow-[3px_3px_0_hsl(var(--border))]"
      role="toolbar"
      aria-label="Selected media actions"
    >
      <span className="text-sm font-medium">
        {selectedItems.length === 1 ? '1 item selected' : `${selectedItems.length} items selected`}
      </span>
      <span className="font-mono text-xs text-muted-foreground">
        {totalBlobs === 1 ? '1 file' : `${totalBlobs} files`} · {formatFileSize(totalSize)}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="ghost" onClick={onSelectAllVisible}>
          <CheckSquare className="h-4 w-4" />
          Select all visible
        </Button>
        <Button size="sm" variant="outline" onClick={() => onAction('mirror')}>
          Mirror
        </Button>
        <Button size="sm" variant="outline" onClick={() => onAction('sync')}>
          Sync
        </Button>
        <Button size="sm" variant="destructive" onClick={() => onAction('delete')}>
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear} aria-label="Clear selection">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
