import { formatFileSize, formatDate } from '../../utils/utils';
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { BlobDescriptor } from 'blossom-client-sdk';
import { HandleSelectBlobType } from '../BlobList/useBlobSelection';

type VideoBlobListProps = {
  videos: BlobDescriptor[];
  handleSelectBlob: HandleSelectBlobType;
  selectedBlobs: { [key: string]: boolean };
};

const VideoBlobList = ({ videos, handleSelectBlob, selectedBlobs }: VideoBlobListProps) => (
  <div className="blob-list grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2 justify-center">
    {videos.map(blob => (
      <div key={blob.sha256} className="p-4 rounded-lg bg-base-300 relative text-center">
        <video src={blob.url} className="m-auto max-h-[40dvh]" preload="metadata" controls playsInline></video>
        <div className="flex flex-grow flex-row text-xs pt-12 items-end">
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
        </div>
      </div>
    ))}
  </div>
);

export default VideoBlobList;
