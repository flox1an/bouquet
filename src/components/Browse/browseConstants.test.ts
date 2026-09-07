import { describe, expect, it } from 'vitest';
import { groupRepeatedPosts, type TimelineItem } from './browseConstants';

const HASH = 'a'.repeat(64);

function item(overrides: Partial<TimelineItem> & Pick<TimelineItem, 'assetId'>): TimelineItem {
  return {
    primaryBlobSha256: HASH,
    eventAuthor: 'author-1',
    blobCount: 1,
    displayTitleIsFallback: true,
    displayDate: 0,
    ...overrides,
  } as TimelineItem;
}

describe('groupRepeatedPosts', () => {
  it('folds repeated posts of one file by one author into their richest event', () => {
    const note = item({ assetId: 'note', blobCount: 1 });
    const video = item({ assetId: 'video', blobCount: 2 });
    const repost = item({ assetId: 'repost', blobCount: 1 });
    expect(groupRepeatedPosts([note, video, repost])).toEqual([video]);
  });

  it('keeps the same file published by different authors separate', () => {
    const mine = item({ assetId: 'mine', eventAuthor: 'author-1' });
    const theirs = item({ assetId: 'theirs', eventAuthor: 'author-2' });
    expect(groupRepeatedPosts([mine, theirs])).toEqual([mine, theirs]);
  });

  it('picks the newest event when richness ties', () => {
    const older = item({ assetId: 'older', displayDate: 1_000 });
    const newer = item({ assetId: 'newer', displayDate: 2_000 });
    expect(groupRepeatedPosts([older, newer])).toEqual([newer]);
  });

  it('prefers a real title over a fallback one', () => {
    const fallback = item({ assetId: 'fallback', displayTitleIsFallback: true, displayDate: 9_000 });
    const described = item({ assetId: 'described', displayTitleIsFallback: false, displayDate: 1_000 });
    expect(groupRepeatedPosts([fallback, described])).toEqual([described]);
  });

  it('never groups unlinked files', () => {
    const first = item({ assetId: 'first', eventAuthor: undefined });
    const second = item({ assetId: 'second', eventAuthor: undefined });
    expect(groupRepeatedPosts([first, second])).toEqual([first, second]);
  });

  it('hides an unlinked thumbnail already represented by a video event', () => {
    const video = item({
      assetId: 'video',
      eventId: 'video-event',
      primaryBlobSha256: 'b'.repeat(64),
      previewBlobSha256: HASH,
    });
    const thumbnail = item({ assetId: 'thumbnail', displayType: 'image', eventAuthor: undefined });

    expect(groupRepeatedPosts([video, thumbnail])).toEqual([video]);
  });
});
