import { NDKEvent, NostrEvent } from '@nostr-dev-kit/ndk';
import { useNDK } from '../../ndk';
import dayjs from 'dayjs';
import { useState } from 'react';

export type FileEventData = {
  content: string;
  url: string;
  dim?: string;
  x: string;
  m?: string;
  size?: string;
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
        ['x', data.x],
        ['url', data.url],
        //['summary', data.summary],
        //['alt', data.alt],
      ],
      kind: 1063,
      pubkey: user?.pubkey || '',
    };

    if (data.size) {
      e.tags.push(['size', data.size]);
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
    await ev.publish();
  };

  return (
    <div>
      <pre>{JSON.stringify(fileEventData, null, 2)}</pre>
      <img src={`https://images.slidestr.net/insecure/f:webp/rs:fill:300/plain/${fileEventData.url}`}></img>
      {fileEventData.dim ? `(${fileEventData.dim})` : ''}
      <div className="flex flex-col gap-4">
        <textarea
          value={fileEventData.content}
          onChange={e => setFileEventData(ed => ({ ...ed, content: e.target.value }))}
          className="textarea textarea-secondary"
          placeholder="Caption"
        ></textarea>
        <button className="btn btn-primary" onClick={() => publishFileEvent(fileEventData)}>
          Publish
        </button>
      </div>
    </div>
  );
};

export default FileEventEditor;
