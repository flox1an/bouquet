import { useMemo } from 'react';
import useEvents from '../utils/useEvents';
import groupBy from 'lodash/groupBy';
import type { Filter, NostrEvent } from 'nostr-tools';
import { useNostr } from '../utils/nostr';
import { mapValues } from 'lodash';
import { extractHashesFromContent } from './blossom';

export const KIND_FILE_META = 1063;
export const KIND_BLOSSOM_DRIVE = 30563;
export const KIND_SOCIAL_POST = 1;
export const KIND_PICTURE = 20;
export const KIND_VIDEO_HORIZONTAL_IMMUTABLE = 21;
export const KIND_VIDEO_VERTICAL_IMMUTABLE = 22;
export const KIND_VIDEO_HORIZONTAL = 34235;
export const KIND_VIDEO_VERTICAL = 34236;
export const KIND_AUDIO = 31337;

const extractFromEvent = (ev: NostrEvent) => {
  // Extract from x tags
  const xTags = ev.tags.filter(t => t[0] == 'x').map(t => t[1]);

  // Extract from imeta tags (format: ["imeta", "url ...", "x abc123", "m image/jpeg", "image ...", ...])
  // Video events can have multiple imeta tags (one per video variant)
  // Each imeta can have: x (hash), url (video), image (thumbnail), fallback/mirror URLs
  const hashesFromImeta: string[] = [];
  ev.tags
    .filter(t => t[0] == 'imeta')
    .forEach(t => {
      t.slice(1).forEach(item => {
        // Direct hash from 'x' field
        if (item.startsWith('x ')) {
          hashesFromImeta.push(item.slice(2));
        }
        // Extract hashes from URLs (url, image, fallback, mirror)
        if (item.startsWith('url ') || item.startsWith('image ') ||
            item.startsWith('fallback ') || item.startsWith('mirror ')) {
          const url = item.slice(item.indexOf(' ') + 1);
          hashesFromImeta.push(...extractHashesFromContent(url));
        }
      });
    });

  // Extract from url, thumb, image tags
  const hashesFromUrls = ev.tags
    .filter(t => t[0] == 'url' || t[0] == 'thumb' || t[0] == 'image')
    .flatMap(t => extractHashesFromContent(t[1]));

  // Extract from text-track tags (subtitles: ["text-track", "url", "lang"])
  const hashesFromTextTracks = ev.tags
    .filter(t => t[0] == 'text-track' && t[1])
    .flatMap(t => extractHashesFromContent(t[1]));

  const hashesFromContent = extractHashesFromContent(ev.content);
  const uniqueHashes = [...new Set([...xTags, ...hashesFromImeta, ...hashesFromUrls, ...hashesFromTextTracks, ...hashesFromContent])];
  return uniqueHashes.flatMap(t => ({ x: t, ev }));
};

const useFileMetaEventsByHash = () => {
  const { user } = useNostr();

  const fileMetaFilter = useMemo(
    () =>
      ({
        kinds: [
          KIND_FILE_META,
          KIND_BLOSSOM_DRIVE,
          KIND_SOCIAL_POST,
          KIND_PICTURE,
          KIND_VIDEO_HORIZONTAL_IMMUTABLE,
          KIND_VIDEO_VERTICAL_IMMUTABLE,
          KIND_VIDEO_HORIZONTAL,
          KIND_VIDEO_VERTICAL,
          KIND_AUDIO,
        ],
        authors: [user?.pubkey],
        limit: 100,
      }) as Filter,
    [user?.pubkey]
  );
  const fileMetaSub = useEvents(fileMetaFilter);

  const fileMetaEventsByHash = useMemo(() => {
    const allXTags = fileMetaSub.events.flatMap(ev => extractFromEvent(ev));
    const groupedByX = groupBy(allXTags, item => item.x);
    return mapValues(groupedByX, v => v.map(e => e.ev));
  }, [fileMetaSub]);

  return fileMetaEventsByHash;
};

export default useFileMetaEventsByHash;
