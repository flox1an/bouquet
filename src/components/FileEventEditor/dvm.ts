import type { NostrEvent, Filter } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { FileEventData } from './FileEventEditor';
import { useEffect, useMemo, useState } from 'react';
import { useNDK, accountManager } from '../../utils/ndk';
import useEvents from '../../utils/useEvents';
import dayjs from 'dayjs';
import { relayPool, DEFAULT_RELAYS } from '../../nostr/core';
import { ReadonlyAccount } from 'applesauce-accounts/accounts';

const NPUB_DVM_THUMBNAIL_CREATION = 'npub1q8cv87l47fql2xer2uyw509y5n5s9f53h76hvf9377efdptmsvusxf3n8s';

const ensureDecrypted = async (dvmPubkey: string, event: NostrEvent): Promise<NostrEvent | undefined> => {
  if (!event) return undefined;

  const encrypted = event.tags.some(t => t[0] == 'encrypted');

  if (encrypted) {
    const activeAccount = accountManager.active;
    if (!activeAccount || activeAccount instanceof ReadonlyAccount) {
      return undefined;
    }

    try {
      const decryptedContent = await activeAccount.signer.nip04.decrypt(dvmPubkey, event.content);

      if (decryptedContent) {
        event.tags = event.tags.filter(t => t[0] !== 'encrypted').concat(JSON.parse(decryptedContent));
        return event;
      }
    } catch (error) {
      console.error('Failed to decrypt:', error);
      return undefined;
    }
  }
  return event;
};

const useVideoThumbnailDvm = (fileEventData: FileEventData, setFileEventData: (data: FileEventData) => void) => {
  const [thumbnailRequestEventId, setThumbnailRequestEventId] = useState<string | undefined>();
  const { user } = useNDK();

  // Decode the npub to get the pubkey
  const dvmPubkey = useMemo(() => {
    const decoded = nip19.decode(NPUB_DVM_THUMBNAIL_CREATION);
    return decoded.type === 'npub' ? decoded.data : '';
  }, []);

  const thumbnailDvmFilter = useMemo(
    () => ({ kinds: [6204], '#e': [thumbnailRequestEventId || ''] } as Filter),
    [thumbnailRequestEventId]
  );
  const thumbnailSubscription = useEvents(thumbnailDvmFilter, {
    closeOnEose: false,
    disable: thumbnailRequestEventId == undefined,
  });

  useEffect(() => {
    const doASync = async () => {
      const firstEvent = await ensureDecrypted(dvmPubkey, thumbnailSubscription.events[0]);
      if (firstEvent) {
        console.log(firstEvent);
        const urls = firstEvent.tags.filter(t => t[0] === 'thumb').map(t => t[1]);
        const dim = firstEvent.tags.find(t => t[0] === 'dim')?.[1];
        const duration = firstEvent.tags.find(t => t[0] === 'duration')?.[1];
        setFileEventData({ ...fileEventData, thumbnails: urls, dim, duration });
      }
    };
    doASync();
  }, [thumbnailSubscription.events]);

  const createDvmThumbnailRequest = async (data: FileEventData) => {
    const activeAccount = accountManager.active;
    if (!activeAccount || activeAccount instanceof ReadonlyAccount) {
      console.error('No signer available');
      return;
    }

    const thumbCount = 3;

    const encryptedContent = await activeAccount.signer.nip04.encrypt(
      dvmPubkey,
      JSON.stringify([
        ['i', data.url[0], 'url'],
        ['output', 'image/jpeg'],
        ['param', 'thumbnailCount', `${thumbCount}`],
        ['relays', user?.relayUrls.join(',') || DEFAULT_RELAYS.join(',')],
      ])
    );

    const e: Omit<NostrEvent, 'id' | 'sig'> = {
      created_at: dayjs().unix(),
      content: encryptedContent,
      tags: [
        ['p', dvmPubkey],
        ['encrypted'],
      ],
      kind: 5204,
      pubkey: user?.pubkey || '',
    };

    const signedEvent = await activeAccount.signer.signEvent(e);
    console.log(signedEvent);
    setThumbnailRequestEventId(signedEvent.id);
    await relayPool.publish(DEFAULT_RELAYS, signedEvent);
  };

  return {
    createDvmThumbnailRequest,
    thumbnailRequestEventId,
  };
};

export default useVideoThumbnailDvm;
