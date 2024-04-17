import { NDKEvent, NostrEvent } from '@nostr-dev-kit/ndk';
import { useNDK } from '../../ndk';
import dayjs from 'dayjs';
import { useState } from 'react';
import uniq from 'lodash/uniq';
import { formatFileSize } from '../../utils';

export type FileEventData = {
  content: string;
  url: string[];
  dim?: string;
  x: string;
  m?: string;
  size: number;
  //summary: string;
  //alt: string;
};

const FileEventEditor = ({ data }: { data: FileEventData }) => {
  const [fileEventData, setFileEventData] = useState(data);

  const { ndk, user } = useNDK();
  const publishFileEvent = async (data: FileEventData) => {
    const e: NostrEvent = {
      created_at: dayjs().unix(),
      content: data.content,
      tags: [
        ...uniq(data.url).map(du => ['url', du]),
        ['x', data.x],
        //['summary', data.summary],
        //['alt', data.alt],
      ],
      kind: 1063,
      pubkey: user?.pubkey || '',
    };

    if (data.size) {
      e.tags.push(['size', `${data.size}`]);
    }
    if (data.dim) {
      e.tags.push(['dim', data.dim]);
    }
    if (data.m) {
      e.tags.push(['m', data.m]);
    }

    const ev = new NDKEvent(ndk, e);
    await ev.sign();
    console.log(ev.rawEvent());
    // await ev.publish();
  };

  return (
    <div className=" bg-base-200 rounded-xl p-4 text-neutral-content gap-4 flex flex-row">
      {fileEventData.m?.startsWith('image/') && (
        <div className="p-4 bg-base-300">
          <img
            width={200}
            height={200}
            src={`https://images.slidestr.net/insecure/f:webp/rs:fill:300/plain/${fileEventData.url[0]}`}
          ></img>
        </div>
      )}
      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 30em' }}>
        <span className="font-bold">Type</span>
        <span>{fileEventData.m}</span>

        {fileEventData.dim && (
          <>
            <span className="font-bold">Dimensions</span>
            <span>{fileEventData.dim}</span>
          </>
        )}

        <span className="font-bold">File size</span>
        <span>{fileEventData.size ? formatFileSize(fileEventData.size) : 'unknown'}</span>
        <span className="font-bold">Content / Description</span>
        <textarea
          value={fileEventData.content}
          onChange={e => setFileEventData(ed => ({ ...ed, content: e.target.value }))}
          className="textarea"
          placeholder="Caption"
        ></textarea>
        <span className="font-bold">URL</span>
        <textarea
          value={fileEventData.url.join('\n')}
          className="textarea"
          placeholder="URL"/>
        <button className="btn btn-primary" onClick={() => publishFileEvent(fileEventData)}>
          Publish
        </button>
      </div>
    </div>
  );
};

export default FileEventEditor;
