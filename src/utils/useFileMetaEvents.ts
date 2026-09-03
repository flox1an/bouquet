import { useMemo } from 'react';
import useEvents from '../utils/useEvents';
import type { Filter } from 'nostr-tools';
import { useNostr } from '../utils/nostr';
import { groupEventsByHash } from './fileMetaEventIndex';
export const KIND_FILE_META = 1063;
export const KIND_BLOSSOM_DRIVE = 30563;
export const KIND_NSITE_FILE = 34128;
export const KIND_NSITE_SNAPSHOT = 5128;
export const KIND_NSITE_ROOT = 15128;
export const KIND_NSITE_NAMED = 35128;
export const KIND_SOCIAL_POST = 1;
export const KIND_PICTURE = 20;
export const KIND_VIDEO_HORIZONTAL_IMMUTABLE = 21;
export const KIND_VIDEO_VERTICAL_IMMUTABLE = 22;
export const KIND_VIDEO_HORIZONTAL = 34235;
export const KIND_VIDEO_VERTICAL = 34236;
export const KIND_AUDIO = 31337;

export { groupEventsByHash } from './fileMetaEventIndex';

const useFileMetaEventsByHash = () => {
  const { user } = useNostr();

  const fileMetaFilter = useMemo(
    () =>
      ({
        kinds: [
          KIND_FILE_META,
          KIND_BLOSSOM_DRIVE,
          KIND_NSITE_FILE,
          KIND_NSITE_SNAPSHOT,
          KIND_NSITE_ROOT,
          KIND_NSITE_NAMED,
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
    return groupEventsByHash(fileMetaSub.events);
  }, [fileMetaSub]);

  return fileMetaEventsByHash;
};

export default useFileMetaEventsByHash;
