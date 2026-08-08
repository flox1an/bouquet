import { useRef, useState } from 'react';

export type HandleSelectAssetType = (
  assetId: string,
  event?: React.MouseEvent<HTMLElement> | React.ChangeEvent<HTMLInputElement>
) => void;

/** Mirrors useBlobSelection's shift-click range behavior, keyed by assetId over the currently visible order. */
export function useAssetSelection(orderedAssetIds: string[]) {
  const [selectedAssetIds, setSelectedAssetIds] = useState<Record<string, boolean>>({});
  const anchorRef = useRef<string | null>(null);

  const handleSelectAsset: HandleSelectAssetType = (assetId, event) => {
    const isShiftClick =
      event && 'shiftKey' in event && (event as React.MouseEvent<HTMLElement>).shiftKey && anchorRef.current !== null;

    if (isShiftClick) {
      const anchorIndex = orderedAssetIds.indexOf(anchorRef.current!);
      const currentIndex = orderedAssetIds.indexOf(assetId);
      if (anchorIndex !== -1 && currentIndex !== -1) {
        const [start, end] = [anchorIndex, currentIndex].sort((a, b) => a - b);
        const range = orderedAssetIds.slice(start, end + 1);
        setSelectedAssetIds(prev => {
          const next = { ...prev };
          for (const id of range) next[id] = true;
          return next;
        });
        return;
      }
    }
    anchorRef.current = assetId;
    setSelectedAssetIds(prev => ({ ...prev, [assetId]: !prev[assetId] }));
  };

  const clearSelection = () => setSelectedAssetIds({});

  const selectAll = () => {
    setSelectedAssetIds(() => {
      const next: Record<string, boolean> = {};
      for (const id of orderedAssetIds) next[id] = true;
      return next;
    });
  };

  const selectedCount = Object.values(selectedAssetIds).filter(Boolean).length;

  return { selectedAssetIds, setSelectedAssetIds, handleSelectAsset, clearSelection, selectAll, selectedCount };
}
