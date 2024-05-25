import { formatFileSize, formatDate } from '../../utils/utils';
import { ClipboardDocumentIcon, TrashIcon } from '@heroicons/react/24/outline';
import { BlobDescriptor } from 'blossom-client-sdk';
import { Document, Page } from 'react-pdf';

type DocumentBlobListProps = {
  docs: BlobDescriptor[];
  onDelete?: (blob: BlobDescriptor) => void;
};

const DocumentBlobList = ({ docs, onDelete }: DocumentBlobListProps) => (
  <div className="blob-list flex flex-wrap justify-center">
    {docs.map(blob => (
      <div
        key={blob.sha256}
        className="p-4 rounded-lg bg-base-300 m-2 relative flex flex-col"
        style={{ width: '22em' }}
      >
        <a href={blob.url} target="_blank" className="block overflow-clip text-ellipsis py-2">
          <Document file={blob.url}>
            <Page pageIndex={0} width={300} renderTextLayer={false} renderAnnotationLayer={false} renderForms={false} />
          </Document>
        </a>
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

export default DocumentBlobList;