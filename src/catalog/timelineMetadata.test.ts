import { describe, expect, it } from 'vitest';
import type { NostrEvent } from 'nostr-tools';
import { extractTimelineEventMetadata } from './timelineMetadata';

const event = (over: Partial<NostrEvent>): NostrEvent =>
  ({ id: 'e', pubkey: 'p', created_at: 1, kind: 1063, tags: [], content: '', sig: '', ...over }) as NostrEvent;

describe('event title derivation', () => {
  it('treats alt as a summary, not a title', () => {
    // A local reimplementation in the sync list used `alt` as a title, so the same
    // file could be named one thing in Browse and another in Sync.
    const meta = extractTimelineEventMetadata(
      event({ tags: [['alt', 'Screenshot of a bird feeder']], content: 'Look what turned up' })
    );
    expect(meta.title).toBe('Look what turned up');
    expect(meta.subtitle).toBe('Screenshot of a bird feeder');
  });

  it('prefers explicit title tags over content, and honours subject', () => {
    expect(extractTimelineEventMetadata(event({ tags: [['title', 'Nesting box']], content: 'ignored' })).title).toBe(
      'Nesting box'
    );
    expect(extractTimelineEventMetadata(event({ tags: [['subject', 'Nesting box']] })).title).toBe('Nesting box');
    expect(extractTimelineEventMetadata(event({ tags: [['name', 'clip.mp4']] })).title).toBe('clip.mp4');
  });

  it('never presents a bare URL as a title, and flags a fallback as one', () => {
    const meta = extractTimelineEventMetadata(event({ content: 'https://example.com/x.jpg', kind: 1063 }));
    expect(meta.title).not.toContain('http');
    expect(meta.titleIsFallback).toBe(true);
  });

  it('does not flag a real title as a fallback', () => {
    expect(extractTimelineEventMetadata(event({ tags: [['title', 'Real']] })).titleIsFallback).toBe(false);
  });
});
