/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { createElement as h } from 'react';
import { TimelineThumbnail } from './TimelineThumbnail';
import type { TimelineProjection } from '../catalog/advanced';

afterEach(cleanup);

type Item = Pick<
  TimelineProjection,
  | 'displayType'
  | 'displayMimeType'
  | 'previewUrl'
  | 'primaryUrl'
  | 'eventAuthor'
  | 'previewBlobSha256'
  | 'primaryBlobSha256'
  | 'displayTitle'
>;

const hashA = 'a'.repeat(64);

const item = (): Item => ({
  displayType: 'image',
  displayMimeType: 'image/jpeg',
  previewUrl: 'https://media.example/pic.jpg',
  primaryUrl: undefined,
  eventAuthor: undefined,
  previewBlobSha256: hashA,
  primaryBlobSha256: undefined,
  displayTitle: 'A picture',
});

describe('TimelineThumbnail', () => {
  it('keeps a fixed-size box and does not restart the fallback chain when a background refresh hands it a new-but-equal item', () => {
    const { container, rerender } = render(h(TimelineThumbnail, { item: item() }));
    const box = container.firstElementChild as HTMLElement;
    expect(box.className).toContain('aspect-video');

    const firstImg = box.querySelector('img') as HTMLImageElement;
    const firstSrc = firstImg.src;

    // The first source (the imgproxy-rewritten URL) fails to load.
    fireEvent.error(firstImg);
    const secondImg = box.querySelector('img') as HTMLImageElement;
    expect(secondImg.src).not.toBe(firstSrc);
    const secondSrc = secondImg.src;

    // A background catalog refresh rebuilds `item` as a new object with the same
    // content. This must not restart the chain back at the source that just
    // failed - that replay is the "very many retries" and the flapping thumbnail.
    rerender(h(TimelineThumbnail, { item: item() }));
    const afterRerenderImg = box.querySelector('img') as HTMLImageElement;
    expect(afterRerenderImg.src).toBe(secondSrc);

    // The box itself never disappeared or resized across any of this.
    expect(container.firstElementChild).toBe(box);
    expect(box.className).toContain('aspect-video');
  });

  it('shows a placeholder instead of collapsing the box once every source has failed', () => {
    const { container } = render(h(TimelineThumbnail, { item: item() }));
    const box = container.firstElementChild as HTMLElement;

    fireEvent.error(box.querySelector('img') as HTMLImageElement);
    fireEvent.error(box.querySelector('img') as HTMLImageElement);

    // Both sources exhausted: no <img> left, but the sized box is still there.
    expect(box.querySelector('img')).toBeNull();
    expect(box.className).toContain('aspect-video');
    expect(box.querySelector('svg')).toBeTruthy();
  });
  it('fill variant backs the contained image with a blurred copy that never drives the fallback chain', () => {
    const { container } = render(h(TimelineThumbnail, { item: item(), fill: true }));
    const box = container.firstElementChild as HTMLElement;
    // Fills its parent instead of rendering the inline 16:9 box.
    expect(box.className).toContain('h-full');
    expect(box.className).not.toContain('aspect-video');

    const imgs = () => box.querySelectorAll('img');
    expect(imgs()).toHaveLength(2);
    expect(imgs()[0].src).toBe(imgs()[1].src);

    // The backdrop has no error handler: failing it must not skip a source.
    fireEvent.error(imgs()[0]);
    expect(imgs()).toHaveLength(2);
    expect(imgs()[0].src).toBe(imgs()[1].src);

    // Only the main image advances the chain, through both sources to the placeholder.
    const firstSrc = imgs()[1].src;
    fireEvent.error(imgs()[1]);
    expect(imgs()[0].src).not.toBe(firstSrc);
    expect(imgs()[0].src).toBe(imgs()[1].src);
    fireEvent.error(imgs()[1]);
    expect(box.querySelector('img')).toBeNull();
    expect(box.querySelector('svg')).toBeTruthy();
  });

  it('marks extensionless videos for range extraction and hints only confirmed servers', () => {
    const { container } = render(
      h(TimelineThumbnail, {
        item: {
          ...item(),
          displayType: 'video',
          displayMimeType: 'video/mp4',
          previewUrl: undefined,
          primaryUrl: `https://24242.io/${hashA}`,
          previewBlobSha256: undefined,
          primaryBlobSha256: hashA,
        },
        knownServersFor: () => ['nostr.download'],
      })
    );

    const proxyUrl = new URL((container.querySelector('img') as HTMLImageElement).src);
    expect(proxyUrl.pathname).toBe(`/v1/preset/feed-preview-v1/${hashA}.mp4`);
    expect(proxyUrl.searchParams.getAll('xs')).toEqual(['nostr.download']);
  });

  it('proxies extensionless audio for cover art and hints only confirmed servers', () => {
    const { container } = render(
      h(TimelineThumbnail, {
        item: {
          ...item(),
          displayType: 'audio',
          displayMimeType: 'audio/mpeg',
          previewUrl: undefined,
          primaryUrl: `https://24242.io/${hashA}`,
          previewBlobSha256: undefined,
          primaryBlobSha256: hashA,
        },
        knownServersFor: () => ['nostr.download'],
      })
    );

    const proxyUrl = new URL((container.querySelector('img') as HTMLImageElement).src);
    expect(proxyUrl.pathname).toBe(`/v1/preset/feed-preview-v1/${hashA}.mp3`);
    expect(proxyUrl.searchParams.getAll('xs')).toEqual(['nostr.download']);
  });

  it('falls back to a music placeholder when the audio cover never loads', () => {
    const { container } = render(
      h(TimelineThumbnail, {
        item: {
          ...item(),
          displayType: 'audio',
          displayMimeType: 'audio/flac',
          previewUrl: undefined,
          primaryUrl: `https://24242.io/${hashA}`,
          previewBlobSha256: undefined,
          primaryBlobSha256: hashA,
        },
      })
    );
    const box = container.firstElementChild as HTMLElement;
    fireEvent.error(box.querySelector('img') as HTMLImageElement);

    expect(box.querySelector('img')).toBeNull();
    expect(box.querySelector('svg')).toBeTruthy();
  });
});
