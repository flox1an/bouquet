import type { NostrEvent } from 'nostr-tools';
import { extractHashesFromContent } from '../utils/blossom';

export const EVENT_EXTRACTOR_VERSION = 1;

export type EventReference = {
  sha256?: string;
  url?: string;
  role: 'main' | 'original' | 'url' | 'image' | 'thumbnail' | 'fallback' | 'mirror' | 'text-track' | 'content';
  isDirect: boolean;
};

const isHash = (value: string | undefined): value is string => !!value && /^[a-fA-F0-9]{64}$/.test(value);

function hashes(value: string | undefined): string[] {
  return value ? extractHashesFromContent(value).map(hash => hash.toLowerCase()) : [];
}

function addUrlReferences(references: EventReference[], value: string | undefined, role: EventReference['role']) {
  if (!value) return;
  const found = hashes(value);
  if (found.length === 0) {
    references.push({ url: value, role, isDirect: false });
    return;
  }
  for (const sha256 of found) references.push({ sha256, url: value, role, isDirect: false });
}

export function extractEventReferences(event: NostrEvent): EventReference[] {
  const references: EventReference[] = [];
  for (const tag of event.tags) {
    const [name, value] = tag;
    if (name === 'x' && isHash(value)) references.push({ sha256: value.toLowerCase(), role: 'main', isDirect: true });
    if (name === 'ox' && isHash(value)) references.push({ sha256: value.toLowerCase(), role: 'original', isDirect: true });
    if (name === 'url') addUrlReferences(references, value, 'url');
    if (name === 'image') addUrlReferences(references, value, 'image');
    if (name === 'thumb') addUrlReferences(references, value, 'thumbnail');
    if (name === 'text-track') addUrlReferences(references, value, 'text-track');
    if (name !== 'imeta') continue;
    for (const field of tag.slice(1)) {
      const separator = field.indexOf(' ');
      if (separator === -1) continue;
      const key = field.slice(0, separator);
      const fieldValue = field.slice(separator + 1);
      if (key === 'x' && isHash(fieldValue)) references.push({ sha256: fieldValue.toLowerCase(), role: 'main', isDirect: true });
      if (key === 'ox' && isHash(fieldValue)) references.push({ sha256: fieldValue.toLowerCase(), role: 'original', isDirect: true });
      if (key === 'url') addUrlReferences(references, fieldValue, 'url');
      if (key === 'image') addUrlReferences(references, fieldValue, 'image');
      if (key === 'fallback') addUrlReferences(references, fieldValue, 'fallback');
      if (key === 'mirror') addUrlReferences(references, fieldValue, 'mirror');
    }
  }
  for (const sha256 of hashes(event.content)) references.push({ sha256, role: 'content', isDirect: false });
  return references.filter((reference, index, all) =>
    all.findIndex(candidate => candidate.sha256 === reference.sha256 && candidate.url === reference.url && candidate.role === reference.role) === index
  );
}
