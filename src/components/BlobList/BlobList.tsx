import {
  ClipboardDocumentIcon,
  DocumentIcon,
  ExclamationTriangleIcon,
  FilmIcon,
  ListBulletIcon,
  MusicalNoteIcon,
  PhotoIcon,
  PlayIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { BlobDescriptor } from 'blossom-client-sdk';
import { formatDate, formatFileSize } from '../../utils/utils';
import './BlobList.css';
import { useEffect, useMemo, useState } from 'react';
import { Document, Page } from 'react-pdf';
import { useQueries } from '@tanstack/react-query';
import { useServerInfo } from '../../utils/useServerInfo';
import useFileMetaEventsByHash, { KIND_BLOSSOM_DRIVE, KIND_FILE_META } from '../../utils/useFileMetaEvents';
import { nip19 } from 'nostr-tools';
import { AddressPointer, EventPointer } from 'nostr-tools/nip19';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { useGlobalContext } from '../../GlobalState';
import { fetchId3Tag } from '../../utils/id3';

type ListMode = 'gallery' | 'list' | 'audio' | 'video' | 'docs';

type BlobListProps = {
  blobs: BlobDescriptor[];
  onDelete?: (blob: BlobDescriptor) => void;
  title?: string;
  className?: string;
};

const BlobList = ({ blobs, onDelete, title, className = '' }: BlobListProps) => {
  const [mode, setMode] = useState<ListMode>('list');
  const { distribution } = useServerInfo();
  const fileMetaEventsByHash = useFileMetaEventsByHash();
  const { dispatch } = useGlobalContext();

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
console.log(audioFiles);
  const audioFilesWithId3 = useQueries({
    queries: audioFiles.map(af => ({
      queryKey: ['id3', af.sha256],
      queryFn: async () => {
        return await fetchId3Tag(af);
      },
      enabled: mode == 'audio' && !!audioFiles && audioFiles.length > 0,
      staleTime: 1000 * 60 * 5,
      cacheTime: 1000 * 60 * 5,
    })),
  });

  const docs = useMemo(
    () => blobs.filter(b => b.type?.startsWith('application/pdf')).sort((a, b) => (a.uploaded > b.uploaded ? -1 : 1)), // descending
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
          className="link link-primary tooltip"
          data-tip="Copy link to clipboard"
          onClick={() => {
            navigator.clipboard.writeText(blob.url);
          }}
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
  );

  const Badge = ({ ev }: { ev: NDKEvent }) => {
    if (ev.kind == KIND_FILE_META) {
      const nevent = nip19.neventEncode({
        kind: ev.kind,
        id: ev.id,
        author: ev.author.pubkey,
        relays: ev.onRelays.map(r => r.url),
      } as EventPointer);
      return (
        <a target="_blank" href={`https://filestr.vercel.app/e/${nevent}`}>
          <div className="badge badge-primary mr-2">filemeta</div>
        </a>
      );
    }

    if (ev.kind == KIND_BLOSSOM_DRIVE) {
      const naddr = nip19.naddrEncode({
        kind: ev.kind,
        identifier: ev.tagValue('d'),
        pubkey: ev.author.pubkey,
        relays: ev.onRelays.map(r => r.url),
      } as AddressPointer);
      return (
        <a target="_blank" className="badge badge-primary mr-2" href={`https://blossom.hzrd149.com/#/drive/${naddr}`}>
          🌸 drive
        </a>
      );
    }

    return <></>;
  };

  const Badges = ({ blob }: { blob: BlobDescriptor }) => {
    const events = fileMetaEventsByHash[blob.sha256];
    if (!events) return;

    return events.map(ev => <Badge ev={ev}></Badge>);
  };

  return (
    <>
      <div className={`blog-list-header ${className}  ${!title ? 'justify-end' : ''}`}>
        {title && <h2>{title}</h2>}
        <ul className="menu menu-horizontal  menu-active bg-base-200 rounded-box">
          <li>
            <a
              className={' tooltip ' + (mode == 'list' ? 'bg-primary text-primary-content hover:bg-primary ' : '')}
              data-tip="All content"
              onClick={() => setMode('list')}
            >
              <ListBulletIcon />
            </a>
          </li>
          <li className={images.length == 0 ? 'disabled' : ''}>
            <a
              className={' tooltip ' + (mode == 'gallery' ? 'bg-primary text-primary-content hover:bg-primary ' : '')}
              onClick={() => setMode('gallery')}
              data-tip="Images"
            >
              <PhotoIcon />
            </a>
          </li>

          <li className={audioFiles.length == 0 ? 'disabled' : ''}>
            <a
              className={' tooltip  ' + (mode == 'audio' ? 'bg-primary text-primary-content hover:bg-primary ' : '')}
              onClick={() => setMode('audio')}
              data-tip="Music"
            >
              <MusicalNoteIcon />
            </a>
          </li>
          <li className={videos.length == 0 ? 'disabled' : ''}>
            <a
              className={' tooltip ' + (mode == 'video' ? 'bg-primary text-primary-content hover:bg-primary ' : '')}
              onClick={() => setMode('video')}
              data-tip="Video"
            >
              <FilmIcon />
            </a>
          </li>
          <li className={docs.length == 0 ? 'disabled' : ''}>
            <a
              className={' tooltip ' + (mode == 'docs' ? 'bg-primary text-primary-content hover:bg-primary ' : '')}
              onClick={() => setMode('docs')}
              data-tip="PDF documents"
            >
              <DocumentIcon />
            </a>
          </li>
        </ul>
      </div>

      {mode == 'gallery' && (
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
              <Actions blob={blob} className="actions absolute bottom-8 right-0"></Actions>
            </div>
          ))}
        </div>
      )}

      {mode == 'video' && (
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
              <Actions blob={blob} className="actions absolute bottom-10 right-2 " />
            </div>
          ))}
        </div>
      )}

      {mode == 'audio' && (
        <div className="blob-list flex flex-wrap justify-center">
          {audioFilesWithId3.map(
            blob =>
              blob.isSuccess && (
                <div
                  key={blob.data.sha256}
                  className="p-4 rounded-lg bg-base-300 m-2 relative flex flex-col"
                  style={{ width: '24em' }}
                >
                  <div className="flex flex-row gap-4 pb-4">
                    <div className="cover-image">
                      <img
                        width={96}
                        height={96}
                        src={blob.data?.id3?.cover || '/music-placeholder.png'}
                        className="cursor-pointer rounded-md"
                        onClick={() => dispatch({ type: 'SET_CURRENT_SONG', song: {url: blob.data.url, id3: blob.data.id3 }})}
                      />
                      <PlayIcon
                        className="play-icon "
                        onClick={() => dispatch({ type: 'SET_CURRENT_SONG', song: {url: blob.data.url, id3: blob.data.id3 }})}
                      ></PlayIcon>
                    </div>
                    {blob.data.id3 && (
                      <div className="flex flex-col pb-4 flex-grow">
                        {blob.data.id3.title && <span className=" font-bold">{blob.data.id3.title}</span>}
                        {blob.data.id3.artist && <span>{blob.data.id3.artist}</span>}
                        {blob.data.id3.album && (
                          <span>
                            {blob.data.id3.album} {blob.data.id3.year ? `(${blob.data.id3.year})` : ''}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-grow flex-row text-xs items-end">
                    <span>{formatFileSize(blob.data.size)}</span>
                    <span className=" flex-grow text-right">{formatDate(blob.data.uploaded)}</span>
                  </div>
                  <Actions blob={blob.data} className="actions absolute bottom-10 right-2 " />
                </div>
              )
          )}
        </div>
      )}

      {mode == 'docs' && (
        <div className="blob-list flex flex-wrap justify-center">
          {docs.map(blob => (
            <div
              key={blob.sha256}
              className="p-4 rounded-lg bg-base-300 m-2 relative flex flex-col"
              style={{ width: '22em' }}
            >
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
                <span className=" flex-grow text-right">{formatDate(blob.uploaded)}</span>
              </div>
              <Actions blob={blob} className="actions absolute bottom-10 right-2 " />
            </div>
          ))}
        </div>
      )}

      {mode == 'list' && (
        <div className="blob-list">
          <table className="table hover">
            <thead>
              <tr>
                <th>Hash</th>
                <th>Uses</th>
                <th>Size</th>
                <th>Type</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {blobs.map((blob: BlobDescriptor) => (
                <tr className="hover" key={blob.sha256}>
                  <td className="whitespace-nowrap">
                    <DocumentIcon />
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
                  <td>{blob.type && `${blob.type}`}</td>
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
