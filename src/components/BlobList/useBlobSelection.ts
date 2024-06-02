import { BlobDescriptor } from 'blossom-client-sdk';
import { useCallback, useState } from 'react';

export type HandleSelectBlobType = (
  sha256: string,
  event: React.MouseEvent<HTMLElement> | React.ChangeEvent<HTMLInputElement>
) => void;
export const useBlobSelection = (blobs: BlobDescriptor[]) => {
  const [selectedBlobs, setSelectedBlobs] = useState<string[]>([]);

  const handleSelectBlob: HandleSelectBlobType = useCallback(
    (sha256: string, event: React.MouseEvent<HTMLElement> | React.ChangeEvent<HTMLInputElement>) => {
      event.preventDefault();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isMouseEvent = (event: any): event is React.MouseEvent<HTMLTableRowElement> => {
        return event.ctrlKey !== undefined || event.metaKey !== undefined;
      };

      if (isMouseEvent(event)) {
        if (event.ctrlKey || event.metaKey) {
          setSelectedBlobs(prev => (prev.includes(sha256) ? prev.filter(blob => blob !== sha256) : [...prev, sha256]));
        } else if (event.shiftKey) {
          const lastSelectedIndex = blobs.findIndex(blob => blob.sha256 === selectedBlobs[selectedBlobs.length - 1]);
          const currentIndex = blobs.findIndex(blob => blob.sha256 === sha256);
          const [start, end] = [lastSelectedIndex, currentIndex].sort((a, b) => a - b);
          const newSelection = blobs.slice(start, end + 1).map(blob => blob.sha256);
          setSelectedBlobs(prev => Array.from(new Set([...prev, ...newSelection])));
        } else {
          setSelectedBlobs([sha256]);
        }
      } else {
        setSelectedBlobs([sha256]);
      }
    },
    [blobs, selectedBlobs]
  );

  return { handleSelectBlob, selectedBlobs, setSelectedBlobs };
};
