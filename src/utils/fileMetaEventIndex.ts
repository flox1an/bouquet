import type { NostrEvent } from 'nostr-tools';
import { extractEventReferences } from '../catalog/eventReferences';

export function groupEventsByHash(events: NostrEvent[]): Record<string, NostrEvent[]> {
  const byHash = new Map<string, Map<string, NostrEvent>>();

  for (const event of events) {
    for (const reference of extractEventReferences(event)) {
      if (!reference.sha256) continue;
      const eventById = byHash.get(reference.sha256) ?? new Map<string, NostrEvent>();
      eventById.set(event.id, event);
      byHash.set(reference.sha256, eventById);
    }
  }

  return Object.fromEntries([...byHash].map(([sha256, eventById]) => [sha256, [...eventById.values()]]));
}
