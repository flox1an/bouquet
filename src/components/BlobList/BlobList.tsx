import { ClipboardDocumentIcon, DocumentIcon, ListBulletIcon, PhotoIcon, TrashIcon } from '@heroicons/react/24/outline';
import { BlobDescriptor } from 'blossom-client-sdk';
import { formatDate, formatFileSize } from '../../utils';
import './BlobList.css';
import { useState } from 'react';

type ListMode = 'gallery' | 'list';

type BlobListProps = {
  blobs: BlobDescriptor[];
  onDelete?: (blob: BlobDescriptor) => void;
  title?: string;
};

const BlobList = ({ blobs, onDelete, title }: BlobListProps) => {
  const [mode, setMode] = useState<ListMode>('list');

  return (
    <>
      <div className={`blog-list-header ${!title ? 'justify-end' : ''}`}>
        {title && <h2>{title}</h2>}
        <div className=" content-center">
          <button onClick={() => setMode('list')} className={mode == 'list' ? 'selected' : ''}>
            <ListBulletIcon />
          </button>
          <button onClick={() => setMode('gallery')} className={mode == 'gallery' ? 'selected' : ''}>
            <PhotoIcon />
          </button>
        </div>
      </div>

      {mode == 'gallery' && (
        <div className="blob-list flex flex-wrap justify-center">
          {blobs
            .filter(b => b.type?.startsWith('image/'))
            .sort((a, b) => (a.created > b.created ? -1 : 1)) // descending
            .map(blob => (
              <div className="p-2 rounded-lg bg-neutral-900 m-2" style={{ display: 'inline-block' }}>
                <a href={blob.url} target="_blank">
                  <div
                    className=""
                    style={{
                      width: 200,
                      height: 200,
                      cursor: 'pointer',
                      display: 'inline-block',
                      backgroundSize: 'contain',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'center',
                      backgroundImage: `url(https://images.slidestr.net/insecure/f:webp/rs:fill:300/plain/${blob.url})`,
                    }}
                  ></div>
                </a>
                <div className="flex flex-row text-xs">
                  <span>{formatFileSize(blob.size)}</span>
                  <span className=" flex-grow text-right">{formatDate(blob.created)}</span>
                </div>
              </div>
            ))}
        </div>
      )}

      {mode == 'list' && (
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
              <div>
              <span>
                  <a onClick={() => {navigator.clipboard.writeText(blob.url)}}>
                    <ClipboardDocumentIcon />
                  </a>
                </span>
              {onDelete && (
               
                 <span>
                 <a onClick={() => onDelete(blob)}>
                   <TrashIcon />
                 </a>
               </span>    )}
               </div>
          
            </div>
          ))}
        </div>
      )}
    </>
  );
  
};

export default BlobList;
