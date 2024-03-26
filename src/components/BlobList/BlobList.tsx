import { DocumentIcon, TrashIcon } from '@heroicons/react/24/outline';
import { BlobDescriptor } from 'blossom-client-sdk';
import { formatDate, formatFileSize } from '../../utils';
import './BlobList.css';

type BlobListProps = {
  blobs: BlobDescriptor[];
  onDelete?: (blob: BlobDescriptor) => void;
};
const BlobList = ({ blobs, onDelete }: BlobListProps) => {
  return (
    <div className="blob-list">
      {blobs.map((blob: BlobDescriptor) => (
        <div className="blob" key={blob.sha256}>
          <span>
            <DocumentIcon />
          </span>
          <span>
            <a href={blob.url} target="_blank">
              {blob.sha256}
            </a>
          </span>
          <span>{formatFileSize(blob.size)}</span>
          <span>{blob.type && `${blob.type}`}</span>
          <span>{formatDate(blob.created)}</span>
          {onDelete && (
            <span>
              <a onClick={() => onDelete(blob)}>
                <TrashIcon />
              </a>
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

export default BlobList;
