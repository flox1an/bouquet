import { describe, expect, it } from 'vitest';
import { isHlsPlaylistBody, isPlaylistCandidate, parseHlsPlaylist } from './hlsPlaylist';

describe('hls playlist', () => {
  it('sniffs and parses HLS master playlists, media playlists, init maps, and segments', () => {
    const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nlow/index.m3u8\n';
    const media =
      '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:4.0,\nseg-1.ts\n#EXTINF:5.5,\nhttps://cdn.example/seg-2.ts\n';

    expect(isHlsPlaylistBody(`\uFEFF  ${master}`)).toBe(true);
    expect(parseHlsPlaylist('https://cdn.example/master.m3u8', master).playlistUrls).toEqual([
      'https://cdn.example/low/index.m3u8',
    ]);
    expect(parseHlsPlaylist('https://cdn.example/low/index.m3u8', media).segments).toEqual([
      expect.objectContaining({ url: 'https://cdn.example/low/init.mp4', isInit: true }),
      expect.objectContaining({ url: 'https://cdn.example/low/seg-1.ts', duration: 4 }),
      expect.objectContaining({ url: 'https://cdn.example/seg-2.ts', duration: 5.5 }),
    ]);
  });

  it('sniffs playlist candidates by mime type, extension, and size bound', () => {
    expect(isPlaylistCandidate({ mimeType: 'application/x-mpegurl' })).toBe(true);
    expect(isPlaylistCandidate({ url: 'https://cdn.example/master.m3u8?token=1' })).toBe(true);
    expect(isPlaylistCandidate({ mimeType: 'text/plain' })).toBe(true);
    expect(isPlaylistCandidate({ mimeType: 'video/mp4' })).toBe(false);
    expect(isPlaylistCandidate({ size: 1024 * 1024 })).toBe(false);
  });

  it('rejects bodies that are not HLS playlists', () => {
    expect(isHlsPlaylistBody('#EXTM3U\n')).toBe(false);
    expect(isHlsPlaylistBody('not a playlist')).toBe(false);
  });
});
