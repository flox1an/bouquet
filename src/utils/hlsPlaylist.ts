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

/** True for a body that *may* be a playlist, from its first bytes alone - the tags
    `isHlsPlaylistBody` insists on may sit past the point a probe read. */
export function isHlsPlaylistStart(body: string): boolean {
  return body
    .replace(/^\uFEFF/, '')
    .trimStart()
    .startsWith('#EXTM3U');
}

export function isHlsPlaylistBody(body: string): boolean {
  if (!isHlsPlaylistStart(body)) return false;
  return /#EXT-X-STREAM-INF|#EXTINF|#EXT-X-MAP/.test(body);
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
