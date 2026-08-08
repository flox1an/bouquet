/**
 * HLS playlist sniffing and parsing.
 *
 * Extracted from the former `blobRelationshipGraph` module, whose graph-building
 * and action-eligibility code was removed once the catalog took over relationship
 * tracking. These three helpers were its only surviving consumers.
 */

export type ParsedHlsPlaylist = {
  playlistUrls: string[];
  segments: Array<{ url: string; isInit?: boolean; duration?: number }>;
};

const PLAYLIST_MIME_TYPES: Record<string, true> = {
  'application/vnd.apple.mpegurl': true,
  'application/x-mpegurl': true,
  'audio/mpegurl': true,
  'audio/x-mpegurl': true,
};

const MAX_PLAYLIST_SNIFF_BYTES = 512 * 1024;

export function isHlsPlaylistBody(body: string): boolean {
  const normalized = body.replace(/^\uFEFF/, '').trimStart();
  if (!normalized.startsWith('#EXTM3U')) return false;
  return /#EXT-X-STREAM-INF|#EXTINF|#EXT-X-MAP/.test(normalized);
}

export function parseHlsPlaylist(url: string, body: string): ParsedHlsPlaylist {
  const playlistUrls: string[] = [];
  const segments: ParsedHlsPlaylist['segments'] = [];
  const lines = body
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  let nextIsVariant = false;
  let nextDuration: number | undefined;

  for (const line of lines) {
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      nextIsVariant = true;
      continue;
    }

    if (line.startsWith('#EXTINF')) {
      const duration = /^#EXTINF:([^,]+)/.exec(line)?.[1];
      nextDuration = duration ? Number(duration) : undefined;
      continue;
    }

    if (line.startsWith('#EXT-X-MAP')) {
      const initUrl = /URI="([^"]+)"/.exec(line)?.[1] ?? /URI=([^,]+)/.exec(line)?.[1];
      if (initUrl) segments.push({ url: new URL(initUrl, url).href, isInit: true });
      continue;
    }

    if (line.startsWith('#')) continue;

    const resolved = new URL(line, url).href;
    if (nextIsVariant) {
      playlistUrls.push(resolved);
      nextIsVariant = false;
    } else {
      segments.push({ url: resolved, duration: nextDuration });
      nextDuration = undefined;
    }
  }

  return { playlistUrls, segments };
}

export function isPlaylistCandidate(value: { url?: string; mimeType?: string; size?: number; type?: string }): boolean {
  const mimeType = value.mimeType ?? value.type;
  if (mimeType && PLAYLIST_MIME_TYPES[mimeType.toLowerCase()]) return true;
  if (value.url?.toLowerCase().split('?')[0].endsWith('.m3u8')) return true;
  if (value.size !== undefined && value.size > MAX_PLAYLIST_SNIFF_BYTES) return false;
  return !mimeType || mimeType.toLowerCase().startsWith('text/plain');
}
