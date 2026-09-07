import React, { useMemo } from 'react';
import { FileEventData } from './FileEventEditor/FileEventEditor';
import type { NostrEvent } from 'nostr-tools';
import { KIND_AUDIO, KIND_FILE_META, KIND_VIDEO_HORIZONTAL, KIND_VIDEO_VERTICAL } from '../utils/useFileMetaEvents';
import { nip19 } from 'nostr-tools';
import { Link, Loader2, RotateCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { PublishResult } from '../utils/publish';

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
          <a
            className="text-primary hover:underline flex flex-row gap-2 items-center"
            target="_blank"
            rel="noreferrer"
            href={`https://nostr.at/${data.nevent}`}
          >
            <Link className="w-5 h-5" />
            <Badge>{data.type}</Badge>
          </a>
        </div>
      </div>
    )
  );
};

export type PublishJobKind = 'file' | 'audio' | 'video';
/** One publish attempt's outcome: either it never got signed/dispatched (`error`,
    e.g. no signer) or it reached the shared publish module and got a per-relay
    verdict back (issue #9's `PublishResult` - never discarded, so a retry can
    target exactly the relays that failed). */
export type PublishOutcome =
  | { kind: PublishJobKind; result: PublishResult }
  | { kind: PublishJobKind; error: string };
export type FileEventPublishState = FileEventData & { publishOutcomes?: PublishOutcome[] };

const KIND_LABEL: Record<PublishJobKind, string> = { file: 'File event', audio: 'Audio event', video: 'Video event' };

function isRetryable(outcome: PublishOutcome): boolean {
  return 'error' in outcome || outcome.result.verdict === 'failed' || outcome.result.verdict === 'partial';
}

function outcomeStatusLabel(outcome: PublishOutcome): string {
  if ('error' in outcome) return `Signing failed: ${outcome.error}`;
  switch (outcome.result.verdict) {
    case 'delivered':
      return 'Delivered';
    case 'disabled':
      return 'Skipped (publishing disabled)';
    case 'partial':
      return `Partial (${outcome.result.targets.filter(t => t.ok).length}/${outcome.result.targets.length} relays)`;
    case 'failed':
      return 'Failed';
  }
}

function statusClassName(outcome: PublishOutcome): string {
  if ('error' in outcome) return 'text-destructive';
  switch (outcome.result.verdict) {
    case 'delivered':
      return 'text-green-600';
    case 'disabled':
      return 'text-muted-foreground';
    default:
      return 'text-destructive';
  }
}

const UploadPublished: React.FC<{
  fileEventsToPublish: FileEventPublishState[];
  /** Retries exactly one file's one event kind: only its failed relays if it has a
      PublishResult already, or a full re-sign+publish if it never got that far. */
  onRetry: (fileX: string, kind: PublishJobKind) => void;
  /** `${fileX}:${kind}` of the outcome currently being retried, to disable its button. */
  retryingKey?: string;
}> = ({ fileEventsToPublish, onRetry, retryingKey }) => {
  const navigate = useNavigate();

  const allEvents = useMemo(
    () =>
      fileEventsToPublish.flatMap(fe =>
        (fe.publishOutcomes ?? [])
          .filter(
            (outcome): outcome is { kind: PublishJobKind; result: PublishResult } =>
              !('error' in outcome) && (outcome.result.verdict === 'delivered' || outcome.result.verdict === 'partial')
          )
          .map(outcome => outcome.result.event)
      ),
    [fileEventsToPublish]
  );
  const filesWithOutcomes = useMemo(
    () => fileEventsToPublish.filter(fe => (fe.publishOutcomes ?? []).length > 0),
    [fileEventsToPublish]
  );
  const allOutcomes = useMemo(() => filesWithOutcomes.flatMap(fe => fe.publishOutcomes ?? []), [filesWithOutcomes]);
  const everyPublishFailed =
    allOutcomes.length > 0 && allOutcomes.every(outcome => 'error' in outcome || outcome.result.verdict === 'failed');

  return (
    <div className="flex flex-col gap-4 ">
      <h2 className="text-2xl font-bold">{everyPublishFailed ? 'Publishing failed' : 'Publishing results'}</h2>
      {allEvents.length > 0 && (
        <div className="flex flex-col gap-4 w-full bg-muted rounded-xl p-4">
          <div className="font-mono text-xs uppercase text-muted-foreground">Published events</div>
          {allEvents.map(event => (
            <FileEvent key={event.id} event={event} />
          ))}
        </div>
      )}
      {filesWithOutcomes.length > 0 && (
        <div className="flex flex-col gap-3 w-full border rounded-xl bg-muted p-4">
          <div className="font-mono text-xs uppercase text-muted-foreground">Publish status</div>
          {filesWithOutcomes.map(fe => (
            <div key={fe.x} className="flex flex-col gap-2 border-t pt-3 text-sm first:border-t-0 first:pt-0">
              <div className="font-mono text-xs uppercase text-muted-foreground">
                {fe.originalFile?.name ?? fe.title ?? fe.url[0] ?? 'Untitled file'}
              </div>
              {(fe.publishOutcomes ?? []).map(outcome => {
                const retryKey = `${fe.x}:${outcome.kind}`;
                return (
                  <div key={retryKey} className="flex items-center justify-between gap-2">
                    <span className={`break-words ${statusClassName(outcome)}`}>
                      {KIND_LABEL[outcome.kind]}: {outcomeStatusLabel(outcome)}
                    </span>
                    {isRetryable(outcome) && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={retryingKey === retryKey}
                        onClick={() => onRetry(fe.x, outcome.kind)}
                      >
                        {retryingKey === retryKey ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCw className="h-3 w-3" />
                        )}
                        Retry
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <div className="bg-muted rounded-xl p-4 gap-4 flex flex-row flex-wrap justify-center">
        <Button
          className="w-full max-w-40 sm:w-40"
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
