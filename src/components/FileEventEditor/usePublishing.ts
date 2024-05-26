import { NDKEvent, NostrEvent } from '@nostr-dev-kit/ndk';
import dayjs from 'dayjs';
import { FileEventData } from './FileEventEditor';
import { uniq } from 'lodash';
import { useNDK } from '../../utils/ndk';

export const usePublishing = () => {
  const { ndk, user } = useNDK();

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
      // TODO upload thumbnail to own storage
      e.tags.push(['thumb', data.thumbnail]);
      e.tags.push(['image', data.thumbnail]);
    }

    const ev = new NDKEvent(ndk, e);
    await ev.sign();
    console.log(ev.rawEvent());
    // await ev.publish();
  };

  const publishAudioEvent = async (data: FileEventData) => {
    const e: NostrEvent = {
      created_at: dayjs().unix(),
      content: `${data.artist} - ${data.title}`,
      tags: [
        ['d', data.x],
        ...uniq(data.url).map(du => ['media', du]),
        ['x', data.x],
        ...uniq(data.url).map(du => ['imeta', `url ${du}`, `m ${data.m}`]),
      ],
      kind: 31337, // TODO vertical video event based on dim?!
      pubkey: user?.pubkey || '',
    };

    if (data.title) {
      e.tags.push(['title', `${data.title}`]);
      e.tags.push(['subject', `${data.title}`]);
    }

    if (data.artist) {
      e.tags.push(['creator', `${data.artist}`]);
      e.tags.push(['creator', `${data.artist}`, 'Artist']);
    }

    if (data.album) {
      e.tags.push(['album', `${data.album}`]);
    }

    const ev = new NDKEvent(ndk, e);
    await ev.sign();
    console.log(ev.rawEvent());
    // await ev.publish();
  };

  const publishVideoEvent = async (data: FileEventData) => {
    const e: NostrEvent = {
      created_at: dayjs().unix(),
      content: data.content,
      tags: [
        ['d', data.x],
        ['x', data.x],
        ['url', data.url[0]],
        ['title', data.content],
        // ['summary', data.], TODO add summary
        ['published_at', `${dayjs().unix()}`],
        ['client', 'bouquet'],
      ],
      kind: 31337,
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
      // TODO upload to own blossom instance
      e.tags.push(['thumb', data.thumbnail]);
      e.tags.push(['preview', data.thumbnail]);
    }

    // TODO add tags ("t")

    const ev = new NDKEvent(ndk, e);
    await ev.sign();
    console.log(ev.rawEvent());
    // await ev.publish();
  };

  return {
    publishAudioEvent,
    publishFileEvent,
    publishVideoEvent,
  };
};
