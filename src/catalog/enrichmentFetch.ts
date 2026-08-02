import type { BlobPrefixLoader, HlsPlaylistLoader } from './catalog';

export const fetchBlobPrefix: BlobPrefixLoader = async (url, maxBytes) => {
  const response = await fetch(url, { headers: { Range: `bytes=0-${maxBytes - 1}` } });
  if (!response.ok && response.status !== 206) throw new Error(`Blob fetch failed with HTTP ${response.status}`);
  const contentRange = response.headers.get('content-range');
  const rangeSize = contentRange ? Number(/\/(\d+)$/.exec(contentRange)?.[1]) : undefined;
  const declaredSize = rangeSize || Number(response.headers.get('content-length')) || undefined;
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Blob response has no readable body');
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

export const fetchHlsPlaylist: HlsPlaylistLoader = async url => {
  const prefix = await fetchBlobPrefix(url, 512 * 1024);
  if (prefix.truncated) throw new Error('Playlist exceeds the 512 KiB enrichment limit');
  return new TextDecoder().decode(prefix.bytes);
};
