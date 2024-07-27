import { NDKEvent, NostrEvent } from '@nostr-dev-kit/ndk';
import dayjs from 'dayjs';
import { FileEventData } from './FileEventEditor';
import { uniq } from 'lodash';
import { useNDK } from '../../utils/ndk';
import { KIND_AUDIO, KIND_FILE_META, KIND_VIDEO_HORIZONTAL, KIND_VIDEO_VERTICAL } from '../../utils/useFileMetaEvents';

export const usePublishing = () => {
  const { ndk, user } = useNDK();

  const publishFileEvent = async (data: FileEventData): Promise<NostrEvent> => {
    const e: NostrEvent = {
      created_at: dayjs().unix(),
      content: data.content,
      tags: [
        ...uniq(data.url).map(du => ['url', du]),
        ['x', data.x],
        ['summary', data.content],
        ...data.tags.map(t => ['t', t]),
      ],
      kind: KIND_FILE_META,
      pubkey: user?.pubkey || '',
    };

    if (data.title) {
      e.tags.push(['alt', `${data.title}`]);
    }
    if (data.size) {
      e.tags.push(['size', `${data.size}`]);
    }
    if (data.dim) {
      e.tags.push(['dim', data.dim]);
    }
    if (data.m) {
      e.tags.push(['m', data.m]);
    }
    if (data.blurHash) {
      e.tags.push(['blurhash', data.blurHash]);
    }
    if (data.publishedThumbnail) {
      e.tags.push(['thumb', data.publishedThumbnail]);
      e.tags.push(['image', data.publishedThumbnail]);
    }

    const ev = new NDKEvent(ndk, e);
    await ev.sign();
    console.log(ev.rawEvent());
    //await ev.publish();
    return ev.rawEvent();
  };

  const publishAudioEvent = async (data: FileEventData): Promise<NostrEvent> => {
    const e: NostrEvent = {
      created_at: dayjs().unix(),
      content: `${data.artist} - ${data.title}`,
      tags: [
        ['d', data.x],
        ...uniq(data.url).map(du => ['media', du]),
        ...uniq(data.url).map(du => ['imeta', `url ${du}`, `m ${data.m}`, `x ${data.x}`]),
        ...data.tags.map(t => ['t', t]),
      ],
      kind: KIND_AUDIO,
      pubkey: user?.pubkey || '',
    };

    if (data.title) {
      e.tags.push(['title', `${data.title}`]);
      e.tags.push(['subject', `${data.title}`]);
    }

    if (data.artist) {
      e.tags.push(['c', `${data.artist}`, 'artist']);
    }

    if (data.album) {
      e.tags.push(['c', `${data.album}`, 'album']);
    }

    if (data.publishedThumbnail) {
      e.tags.push(['cover', `${data.publishedThumbnail}`]);
    }

    if (data.genre) {
      e.tags.push(['c', `${data.genre}`, 'genre']);

      if (data.subgenre) {
        e.tags.push(['c', `${data.subgenre}`, 'subgenre']);
      }
    }

    e.tags.push(['published_at', `${dayjs().unix()}`]);

    const ev = new NDKEvent(ndk, e);
    await ev.sign();
    console.log(ev.rawEvent());
    //await ev.publish();
    return ev.rawEvent();
  };

  const publishVideoEvent = async (data: FileEventData): Promise<NostrEvent> => {
    const videoIsHorizontal = data.width == undefined || data.height == undefined || data.width > data.height;

    const e: NostrEvent = {
      created_at: dayjs().unix(),
      content: data.content,
      tags: [
        ['d', data.x],
        ['x', data.x],
        ['url', data.url[0]],
        ['summary', data.content],
        ['published_at', `${dayjs().unix()}`],
        ['client', 'bouquet'],
        ...data.tags.map(t => ['t', t]),
      ],
      kind: videoIsHorizontal ? KIND_VIDEO_HORIZONTAL : KIND_VIDEO_VERTICAL,
      pubkey: user?.pubkey || '',
    };
    if (data.title) {
      e.tags.push(['title', data.title]);
    }
    if (data.size) {
      e.tags.push(['size', `${data.size}`]);
    }
    if (data.dim) {
      e.tags.push(['dim', data.dim]);
    }
    if (data.duration) {
      e.tags.push(['duration', data.duration]);
    }
    if (data.m) {
      e.tags.push(['m', data.m]);
    }
    if (data.publishedThumbnail) {
      e.tags.push(['thumb', data.publishedThumbnail]);
      e.tags.push(['image', data.publishedThumbnail]);
    }

    const ev = new NDKEvent(ndk, e);
    await ev.sign();
    console.log(ev.rawEvent());
    //await ev.publish();
    return ev.rawEvent();
  };

  return {
    publishAudioEvent,
    publishFileEvent,
    publishVideoEvent,
  };
};
