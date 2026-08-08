import { describe, expect, it } from 'vitest';
import type { NostrEvent } from 'nostr-tools';
import { extractEventReferences, EVENT_EXTRACTOR_VERSION } from './eventReferences';

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const hashC = 'c'.repeat(64);
const hashD = 'd'.repeat(64);
const hashE = 'e'.repeat(64);

function event(id: string, createdAt: number, tags: string[][], content = '', kind = 1063): NostrEvent {
  return { id, pubkey: 'p'.repeat(64), kind, created_at: createdAt, tags, content, sig: 'sig' } as NostrEvent;
}

describe('extractEventReferences', () => {
  it('extracts x and ox tags as direct references', () => {
    const refs = extractEventReferences(
      event('e1', 100, [
        ['x', hashA],
        ['ox', hashB],
      ])
    );

    expect(refs).toContainEqual(expect.objectContaining({ sha256: hashA, role: 'main', isDirect: true }));
    expect(refs).toContainEqual(expect.objectContaining({ sha256: hashB, role: 'original', isDirect: true }));
  });
  it.each([30563, 15128, 35128, 5128])(
    'extracts file hashes from kind %i nsite path tags without treating the aggregate as a file',
    kind => {
      const refs = extractEventReferences(
        event(
          'nsite',
          100,
          [
            ['path', '/index.html', hashA],
            ['path', '/assets/app.js', hashB],
            ['x', hashC, 'aggregate'],
          ],
          '',
          kind
        )
      );

      expect(refs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sha256: hashA, role: 'path', isDirect: true }),
          expect.objectContaining({ sha256: hashB, role: 'path', isDirect: true }),
        ])
      );
      expect(refs).not.toContainEqual(expect.objectContaining({ sha256: hashC }));
    }
  );

  it('extracts url, image, thumb, text-track tag values', () => {
    const refs = extractEventReferences(
      event('e1', 100, [
        ['url', `https://cdn.example/${hashA}`],
        ['image', `https://cdn.example/${hashB}`],
        ['thumb', `https://cdn.example/${hashC}`],
        ['text-track', `https://cdn.example/track.vtt`],
      ])
    );

    expect(refs).toContainEqual(
      expect.objectContaining({ sha256: hashA, url: `https://cdn.example/${hashA}`, role: 'url' })
    );
    expect(refs).toContainEqual(
      expect.objectContaining({ sha256: hashB, url: `https://cdn.example/${hashB}`, role: 'image' })
    );
    expect(refs).toContainEqual(
      expect.objectContaining({ sha256: hashC, url: `https://cdn.example/${hashC}`, role: 'thumbnail' })
    );
    // text-track without hash: explicit media tags always create URL-only references
    expect(refs).toContainEqual(
      expect.objectContaining({
        url: `https://cdn.example/track.vtt`,
        role: 'text-track',
      })
    );
  });

  it('extracts imeta tags', () => {
    const refs = extractEventReferences(
      event('e1', 100, [
        [
          'imeta',
          `x ${hashA}`,
          `ox ${hashB}`,
          `url https://cdn.example/${hashC}`,
          `image https://cdn.example/${hashD}`,
          `fallback https://cdn.example/${hashE}`,
          `mirror https://other.example/${hashA}`,
        ],
      ])
    );

    expect(refs).toContainEqual(expect.objectContaining({ sha256: hashA, role: 'main', isDirect: true }));
    expect(refs).toContainEqual(expect.objectContaining({ sha256: hashB, role: 'original', isDirect: true }));
    expect(refs).toContainEqual(
      expect.objectContaining({ sha256: hashC, url: `https://cdn.example/${hashC}`, role: 'url' })
    );
    expect(refs).toContainEqual(
      expect.objectContaining({ sha256: hashD, url: `https://cdn.example/${hashD}`, role: 'image' })
    );
    expect(refs).toContainEqual(
      expect.objectContaining({ sha256: hashE, url: `https://cdn.example/${hashE}`, role: 'fallback' })
    );
    expect(refs).toContainEqual(
      expect.objectContaining({ sha256: hashA, url: `https://other.example/${hashA}`, role: 'mirror' })
    );
  });

  it('extracts SHA256 hashes from content', () => {
    const refs = extractEventReferences(
      event('e1', 100, [], `https://cdn.example/${hashA} and https://other.example/${hashB}.mp4`)
    );

    expect(refs).toContainEqual(expect.objectContaining({ sha256: hashA, role: 'content' }));
    expect(refs).toContainEqual(expect.objectContaining({ sha256: hashB, role: 'content' }));
  });

  it('extracts NIP-96 URLs from content', () => {
    const pubkey = 'b7c6f6915cfa9a62fff6a1f02604de88c23c6c6c6d1b8f62c7cc10749f307e81';
    const refs = extractEventReferences(event('e1', 100, [], `https://nostrcheck.me/media/${pubkey}/${hashA}.mp4`));

    expect(refs).toContainEqual(expect.objectContaining({ sha256: hashA, role: 'content' }));
  });

  it('extracts NIP-96 URLs from tag values', () => {
    const pubkey = 'b7c6f6915cfa9a62fff6a1f02604de88c23c6c6c6d1b8f62c7cc10749f307e81';
    const refs = extractEventReferences(
      event('e1', 100, [['url', `https://nostrcheck.me/media/${pubkey}/${hashA}.mp4`]])
    );

    expect(refs).toContainEqual(expect.objectContaining({ sha256: hashA, role: 'url' }));
  });

  describe('generic tag scanning', () => {
    it('extracts URLs from unknown tags when hash is present in path', () => {
      const refs = extractEventReferences(
        event('e1', 100, [
          ['r', `https://cdn.example/${hashA}`],
          ['web', `https://cdn.example/${hashB}`],
        ])
      );

      expect(refs).toContainEqual(
        expect.objectContaining({ sha256: hashA, url: `https://cdn.example/${hashA}`, role: 'r' })
      );
      expect(refs).toContainEqual(
        expect.objectContaining({ sha256: hashB, url: `https://cdn.example/${hashB}`, role: 'web' })
      );
    });

    it('does not create URL-only references for unknown servers', () => {
      const refs = extractEventReferences(event('e1', 100, [['r', `https://unknown.example/some/path`]]));

      // No hash in path, no known server → no reference
      expect(refs.filter(r => r.role === 'r')).toHaveLength(0);
    });

    it('creates URL-only references for known servers', () => {
      const refs = extractEventReferences(event('e1', 100, [['r', `https://cdn.example/some/path/video.mp4`]]), [
        'https://cdn.example',
      ]);

      expect(refs).toContainEqual(
        expect.objectContaining({
          url: 'https://cdn.example/some/path/video.mp4',
          role: 'r',
        })
      );
    });

    it('extracts hash from known server URLs even without standard path', () => {
      // NIP-96 URL on a known server
      const pubkey = 'b7c6f6915cfa9a62fff6a1f02604de88c23c6c6c6d1b8f62c7cc10749f307e81';
      const refs = extractEventReferences(
        event('e1', 100, [['server', `https://nostrcheck.me/media/${pubkey}/${hashA}.mp4`]]),
        ['https://nostrcheck.me']
      );

      expect(refs).toContainEqual(expect.objectContaining({ sha256: hashA, role: 'server' }));
    });
  });

  describe('content URL extraction', () => {
    it('extracts SHA256 hashes from URLs in content', () => {
      const refs = extractEventReferences(event('e1', 100, [], `Check out https://cdn.example/${hashA} for the image`));

      expect(refs).toContainEqual(expect.objectContaining({ sha256: hashA, role: 'content' }));
    });

    it('creates URL-only references for known servers in content', () => {
      const refs = extractEventReferences(event('e1', 100, [], `Stream at https://cdn.example/live/stream.m3u8`), [
        'https://cdn.example',
      ]);

      expect(refs).toContainEqual(
        expect.objectContaining({
          url: 'https://cdn.example/live/stream.m3u8',
          role: 'content',
        })
      );
    });

    it('does not create URL-only references for unknown servers in content', () => {
      const refs = extractEventReferences(event('e1', 100, [], `Visit https://example.com/page`), [
        'https://cdn.example',
      ]);

      expect(refs.filter(r => r.role === 'content')).toHaveLength(0);
    });
  });

  describe('deduplication', () => {
    it('deduplicates identical sha256+url+role combinations', () => {
      const refs = extractEventReferences(
        event('e1', 100, [
          ['url', `https://cdn.example/${hashA}`],
          ['url', `https://cdn.example/${hashA}`],
        ])
      );

      expect(refs.filter(r => r.sha256 === hashA && r.role === 'url')).toHaveLength(1);
    });
  });

  describe('version', () => {
    it('has the correct extractor version', () => {
      expect(EVENT_EXTRACTOR_VERSION).toBe(4);
    });
  });
});
