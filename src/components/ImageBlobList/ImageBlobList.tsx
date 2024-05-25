import { formatFileSize, formatDate } from '../../utils/utils';
import { ClipboardDocumentIcon, TrashIcon } from '@heroicons/react/24/outline';
import { BlobDescriptor } from 'blossom-client-sdk';

type ImageBlobListProps = {
  images: BlobDescriptor[];
  onDelete?: (blob: BlobDescriptor) => void;
};

const ImageBlobList = ({ images, onDelete }: ImageBlobListProps) => (
  <div className="blob-list flex flex-wrap justify-center flex-grow">
    {images.map(blob => (
      <div key={blob.sha256} className="p-2 rounded-lg bg-base-300 m-2 relative inline-block text-center">
        <a href={blob.url} target="_blank">
          <div
            className="bg-center bg-no-repeat bg-contain cursor-pointer inline-block w-[90vw] md:w-[200px] h-[200px]"
            style={{
              backgroundImage: `url(https://images.slidestr.net/insecure/f:webp/rs:fill:300/plain/${blob.url})`,
            }}
          ></div>
        </a>
        <div className="flex flex-row text-xs">
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
          {onDelete && (
            <span>
              <a onClick={() => onDelete(blob)} className="link link-primary tooltip" data-tip="Delete this blob">
                <TrashIcon />
              </a>
            </span>
          )}
        </div>
      </div>
    ))}
  </div>
);

export default ImageBlobList;
