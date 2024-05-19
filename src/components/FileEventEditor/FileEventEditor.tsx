import { NDKEvent, NDKKind, NDKUser, NostrEvent } from '@nostr-dev-kit/ndk';
import { useNDK } from '../../utils/ndk';
import dayjs from 'dayjs';
import { useEffect, useMemo, useState } from 'react';
import uniq from 'lodash/uniq';
import { formatFileSize } from '../../utils/utils';
import useEvents from '../../utils/useEvents';

export type FileEventData = {
  content: string;
  url: string[];
  dim?: string;
  x: string;
  m?: string;
  size: number;
  thumbnails?: string[];
  thumbnail?: string;
  //summary: string;
  //alt: string;
};

const ensureDecrypted = async (dvm: NDKUser, event: NDKEvent) => {
  if (!event) return undefined;

  const encrypted = event.tags.some(t => t[0] == 'encrypted');

  if (encrypted) {
    const decryptedContent = await event.ndk?.signer?.decrypt(dvm, event.content);

    if (decryptedContent) {
      return {
        ...event,
        tags: event.tags.filter(t => t[0] !== 'encrypted').concat(JSON.parse(decryptedContent)),
      };
    }
  }
  return event;
};

const NPUB_DVM_THUMBNAIL_CREATION = 'npub1q8cv87l47fql2xer2uyw509y5n5s9f53h76hvf9377efdptmsvusxf3n8s';

const FileEventEditor = ({ data }: { data: FileEventData }) => {
  const [fileEventData, setFileEventData] = useState(data);
  const [thumbnailRequestEventId, setThumbnailRequestEventId] = useState<string | undefined>();
  const { ndk, user } = useNDK();
  const dvm = ndk.getUser({ npub: NPUB_DVM_THUMBNAIL_CREATION });

  const thumbnailDvmFilter = useMemo(
    () => ({ kinds: [6204 as NDKKind], '#e': [thumbnailRequestEventId || ''] }),
    [thumbnailRequestEventId]
  );
  const thumbnailSubscription = useEvents(thumbnailDvmFilter, {
    closeOnEose: false,
    disable: thumbnailRequestEventId == undefined,
  });

  useEffect(() => {
    const doASync = async () => {
      const firstEvent = await ensureDecrypted(dvm, thumbnailSubscription.events[0]);
      if (firstEvent) {
        const urls = firstEvent.tags.filter(t => t[0] === 'thumb').map(t => t[1]);
        const dim = firstEvent.tags.find(t => t[0] === 'dim')?.[1];
        setFileEventData(ed => ({ ...ed, thumbnails: urls, dim, thumbnail: urls[0] }));
      }
    };
    doASync();
  }, [thumbnailSubscription.events]);

  const publishFileEvent = async (data: FileEventData) => {

    // TODO REupload selected video thumbnail from DVM

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
    if (data.thumbnail) {
      e.tags.push(['thumb', data.thumbnail]);
      e.tags.push(['image', data.thumbnail]);
    }

    const ev = new NDKEvent(ndk, e);
    await ev.sign();
    console.log(ev.rawEvent());
    // await ev.publish();
  };

  /*
  async function createDvmBlossemAuthToken() {
    const pubkey = ndk.activeUser?.pubkey;
    if (!ndk.signer || !pubkey) return;
    const tenMinutes = () => dayjs().unix() + 10 * 60;
    const authEvent = ({
      pubkey,
      created_at: dayjs().unix(),
      kind: 24242,
      content: 'Upload thumbail',
      tags: [
        ['t', 'upload'],
        ['name', `thumb_${Math.random().toString(36).substring(2)}`], // make sure the auth events are unique
        ['expiration', String(tenMinutes())],
      ],
    });
    const ev = new NDKEvent(ndk, authEvent);
    await ev.sign();
    console.log(JSON.stringify(ev.rawEvent()));
    return btoa(JSON.stringify(ev.rawEvent()));
  }
  */

  const getThumbnails = async (data: FileEventData) => {
    if (!ndk.signer) return;

    const thumbCount = 3;

    /*s
    const authTokens = [];
    for (let i = 0; i < thumbCount; i++) {
      const uploadAuth = await createDvmBlossemAuthToken();
      if (uploadAuth) {
        authTokens.push(['param', 'authToken', uploadAuth]);
      }
    }
    */

    const e: NostrEvent = {
      created_at: dayjs().unix(),
      content: await ndk.signer?.encrypt(
        dvm,
        JSON.stringify([
          ['i', data.url[0], 'url'],
          ['output', 'image/jpeg'],
          ['param', 'thumbnailCount', `${thumbCount}`],
          ['relays', user?.relayUrls.join(',') || ndk.explicitRelayUrls?.join(',') || ''],
        ])
      ),
      tags: [
        ['p', dvm.pubkey],
        ['encrypted'],
        // TODO set expiration
      ],
      kind: 5204,
      pubkey: user?.pubkey || '',
    };
    const ev = new NDKEvent(ndk, e);
    await ev.sign();
    console.log(ev.rawEvent());
    setThumbnailRequestEventId(ev.id);
    await ev.publish();
  };

  useEffect(() => {
    if (fileEventData.m?.startsWith('video/') && fileEventData.thumbnails == undefined) {
      getThumbnails(fileEventData);
    }
  }, [fileEventData]);

  return (
    <div className=" bg-base-200 rounded-xl p-4 text-neutral-content gap-4 flex flex-row">
      {fileEventData.m?.startsWith('video/') && (
        <>
          {thumbnailRequestEventId &&
            (fileEventData.thumbnails && fileEventData.thumbnails.length > 0 ? (
              <div className="w-2/6">
                <div className="carousel w-full">
                  {fileEventData.thumbnails.map((t, i) => (
                    <div id={`item${i + 1}`} key={`item${i + 1}`} className="carousel-item w-full">
                      <img src={t} className="w-full" />
                    </div>
                  ))}
                </div>
                <div className="flex justify-center w-full py-2 gap-2">
                  {fileEventData.thumbnails.map((t, i) => (
                    <a
                      key={`link${i + 1}`}
                      href={`#item${i + 1}`}
                      onClick={() => setFileEventData(ed => ({ ...ed, thumbnail: t }))}
                      className={'btn btn-xs ' + (t == fileEventData.thumbnail ? 'btn-primary' : '')}
                    >{`${i + 1}`}</a>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                Creating previews <span className="loading loading-spinner loading-md"></span>
              </div>
            ))}
        </>
      )}

      {fileEventData.m?.startsWith('image/') && (
        <div className="p-4 bg-base-300 w-2/6">
          <img
            width={300}
            height={300}
            src={`https://images.slidestr.net/insecure/f:webp/rs:fill:300/plain/${fileEventData.url[0]}`}
          ></img>
        </div>
      )}
      <div className="grid gap-4 w-4/6" style={{ gridTemplateColumns: '1fr 30em' }}>
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
        <div className="">
          {fileEventData.url.map((text, i) => (
            <div key={i} className="break-words mb-2">
              {text}
            </div>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => publishFileEvent(fileEventData)}>
          Publish
        </button>
      </div>
    </div>
  );
};

export default FileEventEditor;
