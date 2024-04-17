import { useMemo } from 'react';
import useEvents from '../useEvents';
import groupBy from 'lodash/groupBy';
import { NDKFilter } from '@nostr-dev-kit/ndk';
import { useNDK } from '../ndk';
import { mapValues } from 'lodash';

export const KIND_FILE_META = 1063;
export const KIND_BLOSSOM_DRIVE = 30563;

const useFileMetaEventsByHash = () => {
  const { user } = useNDK();

  const fileMetaFilter = useMemo(
    () => ({ kinds: [KIND_FILE_META, KIND_BLOSSOM_DRIVE], authors: [user?.pubkey] }) as NDKFilter,
    [user?.pubkey]
  );
  const fileMetaSub = useEvents(fileMetaFilter);

  /*
  const fileMetaEventsByHash = useMemo(() => {
    const allXTags = fileMetaSub.events.flatMap(ev => ev.tags.filter(t => t[0]=='x').flatMap(t => ({x:t[1], ev})));
console.log(allXTags);
    return groupBy(allXTags, item => item.x)
  }, [fileMetaSub.events]);
*/


  const fileMetaEventsByHash = useMemo(
    () => {
        const allXTags = fileMetaSub.events.flatMap(ev => ev.tags.filter(t => t[0]=='x').flatMap(t => ({x:t[1], ev})));
        const groupedByX= groupBy(allXTags, item => item.x);
        return mapValues(groupedByX, v => v.map(e => e.ev));
    }, 
    [fileMetaSub]
  );
  console.log(fileMetaEventsByHash)

  return fileMetaEventsByHash;
};

export default useFileMetaEventsByHash;
