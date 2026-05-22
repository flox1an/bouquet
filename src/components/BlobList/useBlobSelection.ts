import { BlobDescriptor } from 'blossom-client-sdk';
import { useState, useRef } from 'react';

export type HandleSelectBlobType = (
  sha256: string,
  event?: React.MouseEvent<HTMLElement> | React.ChangeEvent<HTMLInputElement>
) => void;
export const useBlobSelection = (blobs: BlobDescriptor[]) => {
  const [selectedBlobs, setSelectedBlobs] = useState<{ [key: string]: boolean }>({});
  const anchorRef = useRef<string | null>(null);

  const handleSelectBlob: HandleSelectBlobType = (
    sha256: string,
    event?: React.MouseEvent<HTMLElement> | React.ChangeEvent<HTMLInputElement>
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isMouseEvent = (event: any): event is React.MouseEvent<HTMLTableRowElement> => {
      return event.ctrlKey !== undefined || event.metaKey !== undefined;
    };

    if (event && isMouseEvent(event)) {
      if (event.shiftKey && anchorRef.current !== null) {
        const anchorIndex = blobs.findIndex(b => (b.sha256 || b.url) === anchorRef.current);
        const currentIndex = blobs.findIndex(b => (b.sha256 || b.url) === sha256);
        if (anchorIndex !== -1 && currentIndex !== -1) {
          const [start, end] = [anchorIndex, currentIndex].sort((a, b) => a - b);
          const newSelection = blobs.slice(start, end + 1).reduce(
            (acc, blob) => {
              acc[blob.sha256 || blob.url] = true;
              return acc;
            },
            {} as { [key: string]: boolean }
          );
          setSelectedBlobs(prev => ({ ...prev, ...newSelection }));
          return;
        }
      }
      anchorRef.current = sha256;
      setSelectedBlobs(prev => ({ ...prev, [sha256]: !prev[sha256] }));
    } else {
      anchorRef.current = sha256;
      setSelectedBlobs(prev => ({ ...prev, [sha256]: !prev[sha256] }));
    }
  };

  return { handleSelectBlob, selectedBlobs, setSelectedBlobs };
};
