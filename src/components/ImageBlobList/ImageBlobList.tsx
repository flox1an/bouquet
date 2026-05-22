import { useMemo } from 'react';
import { formatFileSize, formatDate } from '../../utils/utils';
import { Clipboard } from 'lucide-react';
import { BlobDescriptor } from 'blossom-client-sdk';
import { HandleSelectBlobType } from '../BlobList/useBlobSelection';
import { Checkbox } from '@/components/ui/checkbox';
import { Pagination, usePagination } from '@/components/ui/pagination';
import { Button } from '@/components/ui/button';

type ImageBlobListProps = {
  images: BlobDescriptor[];
  handleSelectBlob: HandleSelectBlobType;
  selectedBlobs: { [key: string]: boolean };
};

const ImageBlobList = ({ images, handleSelectBlob, selectedBlobs }: ImageBlobListProps) => {
  const {
    currentPage,
    setCurrentPage,
    pageSize,
    totalPages,
    startIndex,
    endIndex,
    handlePageSizeChange,
  } = usePagination(images.length);

  const paginatedImages = useMemo(
    () => images.slice(startIndex, endIndex),
    [images, startIndex, endIndex]
  );

  return (
    <>
      <div className="blob-list grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2 justify-center">
        {paginatedImages.map(blob => (
          <div
            key={blob.sha256}
            className="p-2 rounded-lg bg-muted relative flex flex-col text-center"
            onClick={e => handleSelectBlob(blob.sha256, e)}
          >
            <a href={blob.url} target="_blank">
              <div
                className="bg-center bg-no-repeat bg-contain cursor-pointer inline-block w-[90vw] md:w-[200px] h-[200px]"
                style={{
                  backgroundImage: `url(https://images.slidestr.net/insecure/f:webp/rs:fill:300/plain/${blob.url})`,
                }}
              ></div>
            </a>
            <div className="flex flex-row text-xs items-center">
              <Checkbox
                className="mr-2"
                checked={selectedBlobs[blob.sha256]}
                onCheckedChange={() => handleSelectBlob(blob.sha256)}
                onClick={e => e.stopPropagation()}
              />
              <span>{formatFileSize(blob.size)}</span>
              <span className="flex-grow text-right">{formatDate(blob.uploaded)}</span>
            </div>
            <div className="absolute bottom-8 right-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Copy link to clipboard"
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(blob.url);
                }}
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
        totalItems={images.length}
        startIndex={startIndex}
        endIndex={endIndex}
        onPageChange={setCurrentPage}
        onPageSizeChange={handlePageSizeChange}
      />
    </>
  );
};

export default ImageBlobList;
