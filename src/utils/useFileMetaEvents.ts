import { useMemo } from 'react';
import useEvents from '../utils/useEvents';
import groupBy from 'lodash/groupBy';
import type { Filter, NostrEvent } from 'nostr-tools';
import { useNostr } from '../utils/nostr';
import { mapValues } from 'lodash';
import { extractEventReferences } from '../catalog/eventReferences';

export const KIND_FILE_META = 1063;
export const KIND_BLOSSOM_DRIVE = 30563;
export const KIND_SOCIAL_POST = 1;
export const KIND_PICTURE = 20;
export const KIND_VIDEO_HORIZONTAL_IMMUTABLE = 21;
export const KIND_VIDEO_VERTICAL_IMMUTABLE = 22;
export const KIND_VIDEO_HORIZONTAL = 34235;
export const KIND_VIDEO_VERTICAL = 34236;
export const KIND_AUDIO = 31337;

const extractFromEvent = (event: NostrEvent) =>
  extractEventReferences(event)
    .filter(reference => reference.sha256)
    .map(reference => ({ x: reference.sha256!, ev: event }));

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
