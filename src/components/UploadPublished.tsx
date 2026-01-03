import React, { useMemo } from 'react';
import { FileEventData } from './FileEventEditor/FileEventEditor';
import type { NostrEvent } from 'nostr-tools';
import { KIND_AUDIO, KIND_FILE_META, KIND_VIDEO_HORIZONTAL, KIND_VIDEO_VERTICAL } from '../utils/useFileMetaEvents';
import { nip19 } from 'nostr-tools';
import { Link } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';

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
          <div className="text-xs bg-muted p-4 rounded-xl text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all font-mono max-h-60 overflow-y-auto">
            {JSON.stringify(event, null, 2)}
          </div>
        </div>
        <div className="w-24">
          <a className="text-primary hover:underline flex flex-row gap-2 items-center" target="_blank" href={`https://njump.me/${data.nevent}`}>
            <Link className="w-5 h-5" />
            <Badge>{data.type}</Badge>
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
      <Alert variant="warning">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Events are not published yet. Still under development.</AlertDescription>
      </Alert>
      <div className="flex flex-col gap-4 w-full bg-muted rounded-xl p-4">
        {allEvents.map(event => (
          <FileEvent event={event} />
        ))}
      </div>
      <div className="bg-muted rounded-xl p-4 gap-4 flex flex-row justify-center">
        <Button
          className="w-40"
          onClick={() => {
            navigate('/browse');
          }}
        >
          Close
        </Button>
      </div>
    </div>
  );
};

export default UploadPublished;
