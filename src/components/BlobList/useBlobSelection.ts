import { BlobDescriptor } from 'blossom-client-sdk';
import { useState } from 'react';

export type HandleSelectBlobType = (
  sha256: string,
  event: React.MouseEvent<HTMLElement> | React.ChangeEvent<HTMLInputElement>
) => void;
export const useBlobSelection = (blobs: BlobDescriptor[]) => {
  const [selectedBlobs, setSelectedBlobs] = useState<{ [key: string]: boolean }>({});

  const handleSelectBlob: HandleSelectBlobType = (
    sha256: string,
    event: React.MouseEvent<HTMLElement> | React.ChangeEvent<HTMLInputElement>
  ) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isMouseEvent = (event: any): event is React.MouseEvent<HTMLTableRowElement> => {
      return event.ctrlKey !== undefined || event.metaKey !== undefined;
    };

    if (isMouseEvent(event)) {
      if (event.ctrlKey || event.metaKey) {
        setSelectedBlobs(prev => ({
          ...prev,
          [sha256]: !prev[sha256],
        }));
      } else if (event.shiftKey) {
        const lastSelectedIndex = blobs.findIndex(
          blob => blob.sha256 === Object.keys(selectedBlobs).find(key => selectedBlobs[key])
        );
        const currentIndex = blobs.findIndex(blob => blob.sha256 === sha256);
        const [start, end] = [lastSelectedIndex, currentIndex].sort((a, b) => a - b);
        const newSelection = blobs.slice(start, end + 1).reduce(
          (acc, blob) => {
            acc[blob.sha256] = true;
            return acc;
          },
          {} as { [key: string]: boolean }
        );
        setSelectedBlobs(prev => ({
          ...prev,
          ...newSelection,
        }));
      } else {
        setSelectedBlobs(prev => ({
          ...prev,
          [sha256]: !prev[sha256],
        }));
      }
    } else {
      setSelectedBlobs(prev => ({
        ...prev,
        [sha256]: !prev[sha256],
      }));
    }
  };

  return { handleSelectBlob, selectedBlobs, setSelectedBlobs };
};
