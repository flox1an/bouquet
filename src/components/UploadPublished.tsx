import React, { useMemo } from 'react';
import { FileEventData } from './FileEventEditor/FileEventEditor';
import { NostrEvent } from '@nostr-dev-kit/ndk';
import { KIND_AUDIO, KIND_FILE_META, KIND_VIDEO_HORIZONTAL, KIND_VIDEO_VERTICAL } from '../utils/useFileMetaEvents';
import { nip19 } from 'nostr-tools';
import { LinkIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';

type EventVisModel = {
  id: string;
  type: string;
  nevent: string;
  thumbnail?: string;
  title?: string;
  artist?: string;
  album?: string;
  content?: string;
};

const getValueByTag = (tags: string[][], tagName: string, key?: string): string | undefined => {
  let tagValue = tags.find(tag => tag[0] === tagName);
  if (key) {
    tagValue = tags.find(tag => tag[0] === tagName && tag[2] === key);
  }
  return tagValue ? tagValue[1] : undefined;
};

const getEventDataByKind = (event: NostrEvent): EventVisModel | undefined => {
  if (!event.id || !event.pubkey) return;
  const nevent = nip19.neventEncode({
    id: event.id,
    kind: event.kind,
    author: event.pubkey,
  });
  if (event.kind == KIND_FILE_META) {
    return {
      id: event.id,
      nevent,
      type: 'filemeta',
      thumbnail: getValueByTag(event.tags, 'thumb') || getValueByTag(event.tags, 'image'),
      title: getValueByTag(event.tags, 'title'),
      content: getValueByTag(event.tags, 'summary'),
    };
  } else if (event.kind == KIND_VIDEO_HORIZONTAL || event.kind == KIND_VIDEO_VERTICAL) {
    return {
      id: event.id,
      nevent,
      type: 'video',
      thumbnail: getValueByTag(event.tags, 'thumb') || getValueByTag(event.tags, 'image'),
      title: getValueByTag(event.tags, 'title'),
      content: getValueByTag(event.tags, 'content'),
    };
  } else if (event.kind == KIND_AUDIO) {
    return {
      id: event.id,
      nevent,
      type: 'audio',
      thumbnail: getValueByTag(event.tags, 'cover'),
      title: getValueByTag(event.tags, 'title') || getValueByTag(event.tags, 'subject'),
      content: undefined,
      artist: getValueByTag(event.tags, 'c', 'artist'),
      album: getValueByTag(event.tags, 'c', 'album'),
    };
  }
};

const FileEvent = ({ event }: { event: NostrEvent }) => {
  const data = useMemo(() => getEventDataByKind(event), [event]);
  console.log(data);
  return (
    data && (
      <div className="flex flex-row gap-4 items-center">
        <div className="w-16 min-w-16">
          <img
            width={128}
            height={128}
            src={`https://images.slidestr.net/insecure/f:webp/rs:fill:600/plain/${data.thumbnail}`}
            className="w-full"
          />
        </div>
        <div className="flex flex-col gap-2 flex-grow">
          {data.title && <div className="text-accemt">{data.title}</div>}
          {data.content && <div>{data.content}</div>}
          {data.artist && (
            <div>
              {data.artist} {data.album ? `(${data.album})` : ''}
            </div>
          )}
          <div className="text-xs bg-base-300 p-4 rounded-xl text-neutral-content overflow-x-auto whitespace-pre-wrap break-all font-mono max-h-60 overflow-y-auto">
            {JSON.stringify(event, null, 2)}
          </div>
        </div>
        <div className="w-24">
          <a className="link link-primary flex flex-row gap-2" target="_blank" href={`https://njump.me/${data.nevent}`}>
            <LinkIcon className="w-6 h-6 flex-grow" />
            <div className="badge badge-primary">{data.type}</div>
          </a>
        </div>
      </div>
    )
  );
};

const UploadPublished: React.FC<{ fileEventsToPublish: FileEventData[] }> = ({ fileEventsToPublish }) => {
  const navigate = useNavigate();

  const allEvents = useMemo(() => fileEventsToPublish.flatMap(fe => fe.events), [fileEventsToPublish]);

  return (
    <div className="flex flex-col gap-4 ">
      <h2 className="text-2xl font-bold">Published events</h2>
      <div className="alert alert-warning">Events are not published yet. Still under development.</div>
      <div className="flex flex-col gap-4 w-full bg-base-200 rounded-xl p-4 ">
        {allEvents.map(event => (
          <FileEvent event={event} />
        ))}
      </div>
      <div className="bg-base-200 rounded-xl p-4 text-neutral-content gap-4 flex flex-row justify-center">
        <button
          className={`btn btn-primary w-40`}
          onClick={() => {
            navigate('/browse');
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default UploadPublished;
