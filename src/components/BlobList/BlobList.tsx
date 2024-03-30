import {
  ClipboardDocumentIcon,
  DocumentIcon,
  FilmIcon,
  ListBulletIcon,
  MusicalNoteIcon,
  PhotoIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { BlobDescriptor } from 'blossom-client-sdk';
import { formatDate, formatFileSize } from '../../utils';
import './BlobList.css';
import { useEffect, useMemo, useState } from 'react';
import { Document, Page } from 'react-pdf';
import * as id3 from 'id3js';
import { ID3Tag, ID3TagV2 } from 'id3js/lib/id3Tag';

type ListMode = 'gallery' | 'list' | 'audio' | 'video' | 'docs';

type BlobListProps = {
  blobs: BlobDescriptor[];
  onDelete?: (blob: BlobDescriptor) => void;
  title?: string;
};

type AudioBlob = BlobDescriptor & { id3?: ID3Tag; imageData?: string };

const BlobList = ({ blobs, onDelete, title }: BlobListProps) => {
  const [mode, setMode] = useState<ListMode>('list');
  const [audioFiles, setAudioFiles] = useState<AudioBlob[]>([]);

  const images = useMemo(
    () => blobs.filter(b => b.type?.startsWith('image/')).sort((a, b) => (a.created > b.created ? -1 : 1)), // descending
    [blobs]
  );

  const videos = useMemo(
    () => blobs.filter(b => b.type?.startsWith('video/')).sort((a, b) => (a.created > b.created ? -1 : 1)), // descending
    [blobs]
  );

  const fetchId3Tags = async (audioFiles: AudioBlob[]) => {
    const id3Tags = await Promise.all(audioFiles.map(af => id3.fromUrl(af.url)));

    const filesWithTags = audioFiles.map((af, i) => ({ ...af, id3: id3Tags[i] || undefined }));

    for (const af of filesWithTags) {
      if (af.id3 && af.id3.kind == 'v2') {
        const id3v2 = af.id3 as ID3TagV2;
        if (id3v2.images[0].data) {
          const base64data = btoa(
            new Uint8Array(id3v2.images[0].data).reduce(function (data, byte) {
              return data + String.fromCharCode(byte);
            }, '')
          );
          af.imageData = `data:${id3v2.images[0].type};base64,${base64data}`;
        }
      }
    }

    setAudioFiles(filesWithTags);
    return;
  };

  useEffect(() => {
    const audioFiles = blobs.filter(b => b.type?.startsWith('audio/')).sort((a, b) => (a.created > b.created ? -1 : 1));

    setAudioFiles(audioFiles);

    fetchId3Tags(audioFiles);
  }, [blobs]);

  const docs = useMemo(
    () => blobs.filter(b => b.type?.startsWith('application/pdf')).sort((a, b) => (a.created > b.created ? -1 : 1)), // descending
    [blobs]
  );

  useEffect(() => {
    switch (mode) {
      case 'video':
        if (videos.length == 0) setMode('list');
        break;
      case 'audio':
        if (audioFiles.length == 0) setMode('list');
        break;
      case 'gallery':
        if (images.length == 0) setMode('list');
        break;
      case 'docs':
        if (docs.length == 0) setMode('list');
        break;
    }
  }, [videos, images, audioFiles, mode, docs]);

  const Actions = ({ blob, className }: { blob: BlobDescriptor; className?: string }) => (
    <div className={className}>
      <span>
        <a
          className=" cursor-pointer"
          onClick={() => {
            navigator.clipboard.writeText(blob.url);
          }}
        >
          <ClipboardDocumentIcon />
        </a>
      </span>
      {onDelete && (
        <span>
          <a onClick={() => onDelete(blob)} className=" cursor-pointer">
            <TrashIcon />
          </a>
        </span>
      )}
    </div>
  );

  return (
    <>
      <div className={`blog-list-header ${!title ? 'justify-end' : ''}`}>
        {title && <h2>{title}</h2>}
        <div className=" content-center">
          <button onClick={() => setMode('list')} className={mode == 'list' ? 'selected' : ''} title="All content">
            <ListBulletIcon />
          </button>
          <button
            onClick={() => setMode('gallery')}
            disabled={images.length == 0}
            className={mode == 'gallery' ? 'selected' : ''}
            title="Images"
          >
            <PhotoIcon />
          </button>
          <button
            onClick={() => setMode('audio')}
            disabled={audioFiles.length == 0}
            className={mode == 'audio' ? 'selected' : ''}
            title="Music"
          >
            <MusicalNoteIcon />
          </button>
          <button
            onClick={() => setMode('video')}
            disabled={videos.length == 0}
            className={mode == 'video' ? 'selected' : ''}
            title="Video"
          >
            <FilmIcon />
          </button>
          <button
            onClick={() => setMode('docs')}
            disabled={videos.length == 0}
            className={mode == 'docs' ? 'selected' : ''}
            title="PDF Documents"
          >
            <DocumentIcon />
          </button>
        </div>
      </div>

      {mode == 'gallery' && (
        <div className="blob-list flex flex-wrap justify-center flex-grow">
          {images.map(blob => (
            <div className="p-2 rounded-lg bg-neutral-900 m-2 relative inline-block text-center">
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
              <Actions blob={blob} className="actions absolute bottom-8 right-0"></Actions>
            </div>
          ))}
        </div>
      )}

      {mode == 'video' && (
        <div className="blob-list flex flex-wrap justify-center">
          {videos.map(blob => (
            <div className="p-4 rounded-lg bg-neutral-900 m-2 relative flex flex-col" style={{ width: '340px' }}>
              <video src={blob.url} preload="metadata" width={320} controls playsInline></video>
              <div className="flex flex-grow flex-row text-xs pt-12 items-end">
                <span>{formatFileSize(blob.size)}</span>
                <span className=" flex-grow text-right">{formatDate(blob.created)}</span>
              </div>
              <Actions blob={blob} className="actions absolute bottom-10 right-2 " />
            </div>
          ))}
        </div>
      )}

      {mode == 'audio' && (
        <div className="blob-list flex flex-wrap justify-center">
          {audioFiles.map(blob => (
            <div className="p-4 rounded-lg bg-neutral-900 m-2 relative flex flex-col" style={{ width: '24em' }}>
              {blob.id3 && (
                <div className='flex flex-row gap-4 pb-4'>
                  {blob.imageData && (
                      <img width="120" src={blob.imageData} />
                  )}

                  <div className="flex flex-col pb-4 flex-grow">
                    {blob.id3.title && <span className=" font-bold">{blob.id3.title}</span>}
                    {blob.id3.artist && <span>{blob.id3.artist}</span>}
                    {blob.id3.album && (
                      <span>
                        {blob.id3.album} {blob.id3.year ? `(${blob.id3.year})` : ''}
                      </span>
                    )}
                  </div>
                </div>
              )}
              <audio className='w-full' src={blob.url} controls></audio>

              <div className="flex flex-grow flex-row text-xs pt-12 items-end">
                <span>{formatFileSize(blob.size)}</span>
                <span className=" flex-grow text-right">{formatDate(blob.created)}</span>
              </div>
              <Actions blob={blob} className="actions absolute bottom-10 right-2 " />
            </div>
          ))}
        </div>
      )}

      {mode == 'docs' && (
        <div className="blob-list flex flex-wrap justify-center">
          {docs.map(blob => (
            <div className="p-4 rounded-lg bg-neutral-900 m-2 relative flex flex-col" style={{ width: '22em' }}>
              <a href={blob.url} target="_blank" className="block overflow-clip text-ellipsis py-2">
                <Document file={blob.url}>
                  <Page
                    pageIndex={0}
                    width={300}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    renderForms={false}
                  />
                </Document>
              </a>
              <div className="flex flex-grow flex-row text-xs pt-12 items-end">
                <span>{formatFileSize(blob.size)}</span>
                <span className=" flex-grow text-right">{formatDate(blob.created)}</span>
              </div>
              <Actions blob={blob} className="actions absolute bottom-10 right-2 " />
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
              <Actions blob={blob}></Actions>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default BlobList;
