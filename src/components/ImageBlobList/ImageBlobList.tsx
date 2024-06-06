import { formatFileSize, formatDate } from '../../utils/utils';
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { BlobDescriptor } from 'blossom-client-sdk';
import { HandleSelectBlobType } from '../BlobList/useBlobSelection';

type ImageBlobListProps = {
  images: BlobDescriptor[];
  handleSelectBlob: HandleSelectBlobType;
  selectedBlobs: { [key: string]: boolean };
};

const ImageBlobList = ({ images, handleSelectBlob, selectedBlobs }: ImageBlobListProps) => (
  <div className="blob-list grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2 justify-center">
    {images.map(blob => (
      <div
        key={blob.sha256}
        className="p-2 rounded-lg bg-base-300 relative flex flex-col text-center"
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
        <div className="flex flex-row text-xs">
          <input
            type="checkbox"
            className="checkbox checkbox-primary checkbox-sm mr-2"
            checked={selectedBlobs[blob.sha256]}
            onChange={e => handleSelectBlob(blob.sha256, e)}
            onClick={e => e.stopPropagation()}
          />
          <span>{formatFileSize(blob.size)}</span>
          <span className=" flex-grow text-right">{formatDate(blob.uploaded)}</span>
        </div>
        <div className="actions absolute bottom-8 right-0">
          <span>
            <a
              className="link link-primary tooltip"
              data-tip="Copy link to clipboard"
              onClick={() => navigator.clipboard.writeText(blob.url)}
            >
              <ClipboardDocumentIcon />
            </a>
          </span>
        </div>
      </div>
    ))}
  </div>
);

export default ImageBlobList;
