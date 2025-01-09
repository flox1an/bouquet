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

import { NDKEvent, NDKKind, NDKUser, NostrEvent } from '@nostr-dev-kit/ndk';
import { FileEventData } from './FileEventEditor';
import { useEffect, useMemo, useState } from 'react';
import { useNDK } from '../../utils/ndk';
import useEvents from '../../utils/useEvents';
import dayjs from 'dayjs';

const NPUB_DVM_THUMBNAIL_CREATION = 'npub1q8cv87l47fql2xer2uyw509y5n5s9f53h76hvf9377efdptmsvusxf3n8s';

const ensureDecrypted = async (dvm: NDKUser, event: NDKEvent): Promise<NDKEvent | undefined> => {
  if (!event) return undefined;

  const encrypted = event.tags.some(t => t[0] == 'encrypted');

  if (encrypted) {
    const decryptedContent = await event.ndk?.signer?.decrypt(dvm, event.content);

    if (decryptedContent) {
      event.tags = event.tags.filter(t => t[0] !== 'encrypted').concat(JSON.parse(decryptedContent));
      return event;
    }
  }
  return event;
};

const useVideoThumbnailDvm = (fileEventData: FileEventData, setFileEventData: (data: FileEventData) => void) => {
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
        console.log(firstEvent.rawEvent());
        const urls = firstEvent.tags.filter(t => t[0] === 'thumb').map(t => t[1]);
        const dim = firstEvent.tags.find(t => t[0] === 'dim')?.[1];
        const duration = firstEvent.tags.find(t => t[0] === 'duration')?.[1];
        setFileEventData({ ...fileEventData, thumbnails: urls, dim, duration });
      }
    };
    doASync();
  }, [thumbnailSubscription.events]);

  const createDvmThumbnailRequest = async (data: FileEventData) => {
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

  return {
    createDvmThumbnailRequest,
    thumbnailRequestEventId,
  };
};

export default useVideoThumbnailDvm;
