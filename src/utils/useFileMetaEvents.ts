import { useMemo } from 'react';
import useEvents from '../utils/useEvents';
import groupBy from 'lodash/groupBy';
import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';
import { useNDK } from '../utils/ndk';
import { mapValues, uniq } from 'lodash';

export const KIND_FILE_META = 1063;
export const KIND_BLOSSOM_DRIVE = 30563;
export const KIND_SOCIAL_POST = 1;
export const KIND_VIDEO_HORIZONTAL = 34235;
export const KIND_VIDEO_VERTICAL = 34236;
export const KIND_AUDIO = 31337;


const blossomUrlRegex = /https?:\/\/(?:www\.)?[^\s/]+\/([a-fA-F0-9]{64})(?:\.[a-zA-Z0-9]+)?/g;

function extractHashesFromContent(text: string) {
  let match;
  const hashes = [];
  while ((match = blossomUrlRegex.exec(text)) !== null) {
    hashes.push(match[1]);
  }
  return hashes;
}

const extractFromEvent = (ev: NDKEvent) => {
  const tags = ev.tags.filter(t => t[0] == 'x').map(t => t[1]);
  const hashesFromUrls = ev.tags.filter(t => t[0] == 'url').flatMap(t => extractHashesFromContent(t[1]));
  const hashesFromContent = extractHashesFromContent(ev.content);
  const uniqueHashes = [...new Set([...tags, ...hashesFromUrls, ...hashesFromContent])];
  return uniqueHashes.flatMap(t => ({ x: t, ev }));
};

const useFileMetaEventsByHash = () => {
  const { user } = useNDK();

  const fileMetaFilter = useMemo(
    () =>
      ({
        kinds: [
          KIND_FILE_META,
          KIND_BLOSSOM_DRIVE,
          KIND_SOCIAL_POST,
          KIND_VIDEO_HORIZONTAL,
          KIND_VIDEO_VERTICAL,
          KIND_AUDIO,
        ],
        authors: [user?.pubkey],
        limit: 100,
      }) as NDKFilter,
    [user?.pubkey]
  );
  const fileMetaSub = useEvents(fileMetaFilter);

  const fileMetaEventsByHash = useMemo(() => {
    const allXTags = fileMetaSub.events.flatMap(ev => extractFromEvent(ev));
    const groupedByX = groupBy(allXTags, item => item.x);
    return mapValues(groupedByX, v => v.map(e => e.ev));
  }, [fileMetaSub]);
   console.log(fileMetaEventsByHash);

  return fileMetaEventsByHash;
};

export default useFileMetaEventsByHash;
