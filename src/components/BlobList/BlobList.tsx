import { useState, useMemo } from 'react';
import { BlobDescriptor } from 'blossom-client-sdk';
import {
  ClipboardDocumentIcon,
  DocumentIcon,
  ExclamationTriangleIcon,
  FilmIcon,
  MusicalNoteIcon,
  PhotoIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { formatFileSize, formatDate } from '../../utils/utils';
import ImageBlobList from '../ImageBlobList/ImageBlobList';
import VideoBlobList from '../VideoBlobList/VideoBlobList';
import AudioBlobList from '../AudioBlobList/AudioBlobList';
import DocumentBlobList from '../DocumentBlobList/DocumentBlobList';
import { useServerInfo } from '../../utils/useServerInfo';
import Badge from './Badge';
import BlobListTypeMenu, { ListMode } from './BlobListTypeMenu';
import useFileMetaEventsByHash from '../../utils/useFileMetaEvents';
import './BlobList.css';
import { useBlobSelection } from './useBlobSelection';

type BlobListProps = {
  blobs: BlobDescriptor[];
  onDelete?: (blobs: BlobDescriptor[]) => void;
  title?: string;
  className?: string;
};

const BlobList = ({ blobs, onDelete, title, className = '' }: BlobListProps) => {
  const [mode, setMode] = useState<ListMode>('list');
  const { distribution } = useServerInfo();
  const fileMetaEventsByHash = useFileMetaEventsByHash();
  const { handleSelectBlob, selectedBlobs, setSelectedBlobs } = useBlobSelection(blobs);
  const images = useMemo(
    () => blobs.filter(b => b.type?.startsWith('image/')).sort((a, b) => (a.uploaded > b.uploaded ? -1 : 1)), // descending
    [blobs]
  );

  const videos = useMemo(
    () => blobs.filter(b => b.type?.startsWith('video/')).sort((a, b) => (a.uploaded > b.uploaded ? -1 : 1)), // descending
    [blobs]
  );

  const audioFiles = useMemo(
    () => blobs.filter(b => b.type?.startsWith('audio/')).sort((a, b) => (a.uploaded > b.uploaded ? -1 : 1)),
    [blobs]
  );

  const docs = useMemo(
    () => blobs.filter(b => b.type?.startsWith('application/pdf')).sort((a, b) => (a.uploaded > b.uploaded ? -1 : 1)), // descending
    [blobs]
  );

  const Actions = ({ blob, className }: { blob: BlobDescriptor; className?: string }) => (
    <div className={className}>
      <span>
        <a
          className="link link-primary tooltip"
          data-tip="Copy link to clipboard"
          onClick={e => {
            e.stopPropagation();
            navigator.clipboard.writeText(blob.url);
          }}
        >
          <ClipboardDocumentIcon />
        </a>
      </span>
    </div>
  );

  const getMimeTypeIcon = (type: string | undefined) => {
    if (!type) return <DocumentIcon />;
    if (type.startsWith('image/')) return <PhotoIcon />;
    if (type.startsWith('video/')) return <FilmIcon />;
    if (type.startsWith('audio/')) return <MusicalNoteIcon />;
    if (type === 'application/pdf') return <DocumentIcon />;
    return <DocumentIcon />;
  };

  const Badges = ({ blob }: { blob: BlobDescriptor }) => {
    const events = fileMetaEventsByHash[blob.sha256];
    if (!events) return null;

    return events.map(ev => <Badge ev={ev} key={ev.id}></Badge>);
  };

  const selectedCount = useMemo(() => Object.values(selectedBlobs).filter(v => v).length, [selectedBlobs]);

  return (
    <>
      <div className={`blob-list-header ${className} ${!title ? 'justify-end' : ''}`}>
        {title && <h2>{title}</h2>}

        {selectedCount > 0 && (
          <div className="flex bg-base-200 rounded-box gap-2 mr-2 py-2 px-8 align-middle items-center">
            {selectedCount} blobs selected
            {onDelete && (
              <button
                className="btn btn-icon btn-primary btn-sm tooltip"
                onClick={async () => {
                  await onDelete(blobs.filter(b => selectedBlobs[b.sha256]));
                  setSelectedBlobs({});
                }}
                data-tip="Delete the selected blobs"
              >
                <TrashIcon />
              </button>
            )}
            <button className="btn btn-icon btn-sm" onClick={() => setSelectedBlobs({})}>
              <XMarkIcon className="h-6 w-6 text-gray-500" />
            </button>
          </div>
        )}
        <BlobListTypeMenu
          mode={mode}
          setMode={setMode}
          hasImages={images.length > 0}
          hasVideo={videos.length > 0}
          hasAudio={audioFiles.length > 0}
          hasDocs={docs.length > 0}
        />
      </div>

      {mode == 'gallery' && (
        <ImageBlobList images={images} selectedBlobs={selectedBlobs} handleSelectBlob={handleSelectBlob} />
      )}

      {mode == 'video' && (
        <VideoBlobList videos={videos} selectedBlobs={selectedBlobs} handleSelectBlob={handleSelectBlob} />
      )}

      {mode == 'audio' && (
        <AudioBlobList audioFiles={audioFiles} selectedBlobs={selectedBlobs} handleSelectBlob={handleSelectBlob} />
      )}

      {mode == 'docs' && <DocumentBlobList docs={docs} />}

      {mode == 'list' && (
        <div className="blob-list">
          <table className="table hover">
            <thead>
              <tr>
                <th></th>
                <th>Hash</th>
                <th>Uses</th>
                <th>Size</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {blobs.map((blob: BlobDescriptor) => (
                <tr
                  className={`hover ${selectedBlobs[blob.sha256] ? 'selected' : ''}`}
                  key={blob.sha256}
                  onClick={e => handleSelectBlob(blob.sha256, e)}
                >
                  <td className="whitespace-nowrap w-12">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-primary checkbox-sm mr-2"
                      checked={!!selectedBlobs[blob.sha256]}
                      onChange={e => handleSelectBlob(blob.sha256, e)}
                      onClick={e => e.stopPropagation()}
                    />
                    {getMimeTypeIcon(blob.type)}
                  </td>
                  <td className="whitespace-nowrap">
                    <a className="link link-primary" href={blob.url} target="_blank">
                      {blob.sha256.slice(0, 15)}
                    </a>
                  </td>
                  <td>
                    <Badges blob={blob} />
                    <span className="text-warning tooltip" data-tip="Not distributed to any other server">
                      {distribution[blob.sha256].servers.length == 1 && <ExclamationTriangleIcon />}
                    </span>
                  </td>
                  <td>{formatFileSize(blob.size)}</td>
                  <td>{formatDate(blob.uploaded)}</td>
                  <td className="whitespace-nowrap">
                    <Actions blob={blob}></Actions>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

export default BlobList;
