import { formatFileSize, formatDate } from '../../utils/utils';
import { ClipboardDocumentIcon, TrashIcon } from '@heroicons/react/24/outline';
import { BlobDescriptor } from 'blossom-client-sdk';

type VideoBlobListProps = {
  videos: BlobDescriptor[];
  onDelete?: (blob: BlobDescriptor) => void;
};

const VideoBlobList = ({ videos, onDelete }: VideoBlobListProps) => (
  <div className="blob-list flex flex-wrap justify-center">
    {videos.map(blob => (
      <div
        key={blob.sha256}
        className="p-4 rounded-lg bg-base-300 m-2 relative flex flex-col"
        style={{ width: '340px' }}
      >
        <video src={blob.url} preload="metadata" width={320} controls playsInline></video>
        <div className="flex flex-grow flex-row text-xs pt-12 items-end">
          <span>{formatFileSize(blob.size)}</span>
          <span className=" flex-grow text-right">{formatDate(blob.uploaded)}</span>
        </div>
        <div className="actions absolute bottom-10 right-2 ">
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

export default VideoBlobList;
