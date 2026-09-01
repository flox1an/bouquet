import { useEffect, useRef } from 'react';
import { getCatalogClient } from '../../catalog/catalogClient';
import { probeNativeUrl } from '../../catalog/availabilityFetch';
import type { TimelineItem } from './browseConstants';

/**
 * Checking every item's URL availability on every reprojection doesn't scale - a
 * catalog of thousands of blobs turned into thousands of HEAD requests each time the
 * timeline reprojected, which a relay sync can trigger dozens of times in a row.
 * Availability is only useful for what someone can actually see, so each row/card
 * checks its own item once, the moment it mounts; virtualization already limits
 * mounted rows to what's on screen (plus a small overscan margin).
 *
 * `pubkey` is a plain argument, not read from `useNostr`: presentation components
 * pulling in the relay/IndexedDB singleton from `nostr/core` breaks the plain
 * `renderToString` smoke tests, which run outside jsdom on purpose.
 */
export function useNativeUrlAvailabilityCheck(
  pubkey: string | undefined,
  item: Pick<TimelineItem, 'primaryBlobSha256' | 'availabilityState'>
): void {
  const checked = useRef(false);

  useEffect(() => {
    if (checked.current || !pubkey || !item.primaryBlobSha256 || item.availabilityState !== 'unknown') return;
    checked.current = true;
    void getCatalogClient()
      .refreshEventUrlAvailability(pubkey, probeNativeUrl, 5, [item.primaryBlobSha256])
      .catch(() => undefined);
  }, [pubkey, item.primaryBlobSha256, item.availabilityState]);
}
