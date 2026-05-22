import { useMemo } from 'react';
import { formatFileSize, formatDate } from '../../utils/utils';
import { Clipboard } from 'lucide-react';
import { BlobDescriptor } from 'blossom-client-sdk';
import { HandleSelectBlobType } from '../BlobList/useBlobSelection';
import { Checkbox } from '@/components/ui/checkbox';
import { Pagination, usePagination } from '@/components/ui/pagination';
import { Button } from '@/components/ui/button';

type VideoBlobListProps = {
  videos: BlobDescriptor[];
  handleSelectBlob: HandleSelectBlobType;
  selectedBlobs: { [key: string]: boolean };
};

const VideoBlobList = ({ videos, handleSelectBlob, selectedBlobs }: VideoBlobListProps) => {
  const {
    currentPage,
    setCurrentPage,
    pageSize,
    totalPages,
    startIndex,
    endIndex,
    handlePageSizeChange,
  } = usePagination(videos.length);

  const paginatedVideos = useMemo(
    () => videos.slice(startIndex, endIndex),
    [videos, startIndex, endIndex]
  );

  return (
    <>
      <div className="blob-list grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2 justify-center">
        {paginatedVideos.map(blob => (
          <div key={blob.sha256} className="p-4 rounded-lg bg-muted relative text-center">
            <video src={blob.url} className="m-auto max-h-[40dvh]" preload="metadata" controls playsInline></video>
            <div className="flex flex-grow flex-row text-xs pt-4 items-center">
              <Checkbox
                className="mr-2"
                checked={selectedBlobs[blob.sha256]}
                onCheckedChange={() => handleSelectBlob(blob.sha256)}
                onClick={e => e.stopPropagation()}
              />
              <span>{formatFileSize(blob.size)}</span>
              <span className="flex-grow text-right">{formatDate(blob.uploaded)}</span>
            </div>
            <div className="absolute bottom-10 right-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Copy link to clipboard"
                onClick={() => navigator.clipboard.writeText(blob.url)}
              >
                <Clipboard className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        totalItems={videos.length}
        startIndex={startIndex}
        endIndex={endIndex}
        onPageChange={setCurrentPage}
        onPageSizeChange={handlePageSizeChange}
      />
    </>
  );
};

export default VideoBlobList;
