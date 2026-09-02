import { describe, expect, it } from 'vitest';
import type { NostrEvent } from 'nostr-tools';
import { groupEventsByHash } from './fileMetaEventIndex';

const hash = 'a'.repeat(64);

function event(id: string, tags: string[][]): NostrEvent {
  return {
    id,
    pubkey: 'p'.repeat(64),
    kind: 1063,
    created_at: 1,
    tags,
    content: '',
    sig: 's'.repeat(128),
  } as NostrEvent;
}

describe('groupEventsByHash', () => {
  it('keeps one event badge when an event references the same blob through multiple fields', () => {
    const metadata = event('event-1', [
      ['x', hash],
      ['imeta', `x ${hash}`, `image https://media.example/${hash}.jpg`],
    ]);

    expect(groupEventsByHash([metadata])[hash].map(item => item.id)).toEqual(['event-1']);
  });
});
