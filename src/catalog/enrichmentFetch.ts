import type { BlobPrefixLoader, HlsPlaylistLoader } from './catalog';
import { isHlsPlaylistStart } from '../utils/hlsPlaylist';

/** A hung request used to leave an extraction `pending` forever, and the timeline
    then never learned what the file was. */
const REQUEST_TIMEOUT_MS = 20_000;

export const fetchBlobPrefix: BlobPrefixLoader = async (url, maxBytes) => {
  const request = { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
  let response = await fetch(url, { ...request, headers: { Range: `bytes=0-${maxBytes - 1}` } });
  // Some hosts reject a range that reaches past the end of a small file instead of
  // clamping it, which is what made playlist expansion fail with HTTP 416.
  if (response.status === 416) response = await fetch(url, request);
  if (!response.ok && response.status !== 206) throw new Error(`File fetch failed with HTTP ${response.status}`);
  const contentRange = response.headers.get('content-range');
  const rangeSize = contentRange ? Number(/\/(\d+)$/.exec(contentRange)?.[1]) : undefined;
  const declaredSize = rangeSize || Number(response.headers.get('content-length')) || undefined;
  const reader = response.body?.getReader();
  if (!reader) throw new Error('File response has no readable body');
  const chunks: Uint8Array[] = [];
  let received = 0;
  let truncated = false;
  while (received < maxBytes) {
    const next = await reader.read();
    if (next.done) break;
    const remaining = maxBytes - received;
    const chunk = next.value.byteLength > remaining ? next.value.slice(0, remaining) : next.value;
    chunks.push(chunk);
    received += chunk.byteLength;
    if (chunk.byteLength < next.value.byteLength) {
      truncated = true;
      await reader.cancel();
      break;
    }
  }
  if (received === maxBytes && declaredSize === undefined) truncated = true;
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return {
    bytes: bytes.buffer,
    mimeType: response.headers.get('content-type')?.split(';')[0],
    size: declaredSize,
    truncated: truncated || (declaredSize !== undefined && declaredSize > received),
  };
};

const PLAYLIST_PROBE_BYTES = 1024;

/**
 * Anything a server types generically is a playlist candidate, so most calls here
 * are misses. A miss must stay cheap: the first kilobyte already decides it, and
 * only a body that starts with `#EXTM3U` is worth pulling in full.
 *
 * Whether more remains is judged by the buffer being full, not by `truncated`: a
 * host that answers a range request without a `content-range` header reports the
 * range's own length as the size, which reads as "that was the whole file" and used
 * to cut real playlists down to their first kilobyte.
 */
export const fetchHlsPlaylist: HlsPlaylistLoader = async url => {
  const probe = await fetchBlobPrefix(url, PLAYLIST_PROBE_BYTES);
  const start = new TextDecoder().decode(probe.bytes);
  if (!isHlsPlaylistStart(start) || probe.bytes.byteLength < PLAYLIST_PROBE_BYTES) return start;
  const prefix = await fetchBlobPrefix(url, 512 * 1024);
  if (prefix.truncated && prefix.bytes.byteLength >= 512 * 1024)
    throw new Error('Playlist exceeds the 512 KiB enrichment limit');
  return new TextDecoder().decode(prefix.bytes);
};
