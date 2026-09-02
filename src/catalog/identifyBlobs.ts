import pLimit from 'p-limit';
import { getCatalogClient } from './catalogClient';
import { fetchBlobPrefix, fetchHlsPlaylist } from './enrichmentFetch';
import { PLAYLIST_MIME_TYPES } from '../utils/mimeTypes';

/**
 * Reading a file's first bytes answers both questions the timeline has about an
 * unexplained file: what it is (ADR-0008), and whether it is a playlist whose
 * segments belong folded into it rather than listed beside it (ADR-0009). One read,
 * both answers - so identification is a single path, not one heuristic per question.
 */

/** Enough for every magic number this app reads and for most JPEG headers, without
    pulling megabytes while walking a catalog of thousands of files. */
const IDENTIFY_BYTES = 16 * 1024;

/** Cards go through their own limiter: the sweep queues thousands of files, and
    p-limit is first-in-first-out, so sharing one queue would leave what the user is
    looking at waiting behind everything they are not. */
const visibleLimit = pLimit(3);
const sweepLimit = pLimit(6);
const attempted = new Set<string>();

async function identify(pubkey: string, sha256: string, url: string, notify: boolean): Promise<void> {
  const catalog = getCatalogClient();
  const mimeType = await catalog
    .enrichBlobPrefix(pubkey, sha256, url, fetchBlobPrefix, IDENTIFY_BYTES, notify)
    .catch(() => undefined);
  if (mimeType && PLAYLIST_MIME_TYPES[mimeType])
    await catalog.enrichHls(pubkey, sha256, fetchHlsPlaylist).catch(() => undefined);
}

/** For a file whose card is on screen: jumps the queue ahead of the background sweep. */
export function identifyVisibleBlob(pubkey: string, sha256: string, url: string): void {
  if (attempted.has(sha256)) return;
  attempted.add(sha256);
  void visibleLimit(() => identify(pubkey, sha256, url, true));
}

/** How many files the sweep identifies before it lets the timeline catch up. One
    announcement per file would mean one full reprojection per file. */
const NOTIFY_EVERY = 40;

/**
 * Walks every file nothing has explained yet, smallest first. Each file's outcome is
 * stored as an extractor result, so this is resumable and never repeats work: a
 * catalog converges over a few visits instead of re-reading itself every time.
 */
export async function identifyUnexplainedBlobs(pubkey: string): Promise<void> {
  const pending = await getCatalogClient()
    .queryUnidentifiedBlobs(pubkey)
    .catch(() => [] as Array<{ sha256: string; url: string }>);
  const queue = pending.filter(item => !attempted.has(item.sha256));
  if (queue.length === 0) return;
  let done = 0;
  await Promise.all(
    queue.map(item => {
      attempted.add(item.sha256);
      return sweepLimit(async () => {
        await identify(pubkey, item.sha256, item.url, false);
        done += 1;
        if (done % NOTIFY_EVERY === 0) window.dispatchEvent(new Event('bouquet-catalog-changed'));
      });
    })
  );
  window.dispatchEvent(new Event('bouquet-catalog-changed'));
}
