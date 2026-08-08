import type { NostrEvent } from 'nostr-tools';
import { extractHashesFromContent, extractUrlsFromText } from '../utils/blossom';

export const EVENT_EXTRACTOR_VERSION = 4;

export type EventReference = {
  sha256?: string;
  url?: string;
  mimeType?: string;
  dimensions?: string;
  role: string;
  isDirect: boolean;
};

const isHash = (value: string | undefined): value is string => !!value && /^[a-fA-F0-9]{64}$/.test(value);

const EXPLICIT_TAG_NAMES = new Set(['x', 'ox', 'url', 'image', 'thumb', 'text-track', 'm', 'dim', 'imeta']);
const NSITE_EVENT_KINDS = new Set([30563, 15128, 35128, 5128]);

function hashes(value: string | undefined): string[] {
  return value ? extractHashesFromContent(value).map(hash => hash.toLowerCase()) : [];
}

/**
 * Add a URL reference. If the URL contains a SHA256 hash, extract it.
 * For explicit media tags (url, image, thumb, etc.) a URL-only reference is
 * always created even without a hash. For generic tags and content, a URL-only
 * reference is only created when the URL is on a known Blossom server.
 */
function addUrlReferences(
  references: EventReference[],
  value: string | undefined,
  role: EventReference['role'],
  mimeType?: string,
  options?: { knownServerUrls?: string[]; forceUrlOnly?: boolean }
): void {
  if (!value) return;
  const found = hashes(value);
  if (found.length > 0) {
    for (const sha256 of found) references.push({ sha256, url: value, mimeType, role, isDirect: false });
    return;
  }
  // Explicit media tags always create URL-only references (existing behaviour).
  if (options?.forceUrlOnly) {
    references.push({ url: value, mimeType, role, isDirect: false });
    return;
  }
  // Otherwise a URL-only reference is only created when the URL is on a known Blossom server.
  if (options?.knownServerUrls?.length && options.knownServerUrls.some(base => value.startsWith(base))) {
    references.push({ url: value, mimeType, role, isDirect: false });
  }
}

/** Check if a string is an https?:// URL. */
function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function extractEventReferences(event: NostrEvent, knownServerBaseUrls?: string[]): EventReference[] {
  const references: EventReference[] = [];
  const eventMimeType = event.tags.find(tag => tag[0] === 'm')?.[1];
  const isNsiteManifest = NSITE_EVENT_KINDS.has(event.kind);

  // ── Phase 1: explicit tags (unchanged behaviour) ────────────────────────
  for (const tag of event.tags) {
    const [name, value] = tag;
    if (isNsiteManifest && name === 'path' && isHash(tag[2])) {
      references.push({ sha256: tag[2].toLowerCase(), role: 'path', isDirect: true });
      continue;
    }
    if (name === 'x' && isHash(value) && !(isNsiteManifest && tag[2] === 'aggregate')) {
      references.push({ sha256: value.toLowerCase(), mimeType: eventMimeType, role: 'main', isDirect: true });
      continue;
    }
    if (name === 'ox' && isHash(value)) {
      references.push({ sha256: value.toLowerCase(), mimeType: eventMimeType, role: 'original', isDirect: true });
      continue;
    }
    // Explicit media tags: always add URL references (even without hash)
    if (name === 'url') {
      addUrlReferences(references, value, 'url', eventMimeType, { forceUrlOnly: true });
      continue;
    }
    if (name === 'image') {
      addUrlReferences(references, value, 'image', eventMimeType, { forceUrlOnly: true });
      continue;
    }
    if (name === 'thumb') {
      addUrlReferences(references, value, 'thumbnail', eventMimeType, { forceUrlOnly: true });
      continue;
    }
    if (name === 'text-track') {
      addUrlReferences(references, value, 'text-track', eventMimeType, { forceUrlOnly: true });
      continue;
    }

    if (name !== 'imeta') continue;
    // imeta processing
    const fields = tag.slice(1).flatMap(field => {
      const separator = field.indexOf(' ');
      return separator === -1 ? [] : [[field.slice(0, separator), field.slice(separator + 1)] as const];
    });
    const imetaMimeType = fields.find(([key]) => key === 'm')?.[1] ?? eventMimeType;
    const imetaDimensions = fields.find(([key]) => key === 'dim')?.[1];
    for (const [key, fieldValue] of fields) {
      if (key === 'x' && isHash(fieldValue)) {
        references.push({
          sha256: fieldValue.toLowerCase(),
          mimeType: imetaMimeType,
          dimensions: imetaDimensions,
          role: 'main',
          isDirect: true,
        });
      }
      if (key === 'ox' && isHash(fieldValue)) {
        references.push({
          sha256: fieldValue.toLowerCase(),
          mimeType: imetaMimeType,
          dimensions: imetaDimensions,
          role: 'original',
          isDirect: true,
        });
      }
      if (key === 'url') addUrlReferences(references, fieldValue, 'url', imetaMimeType, { forceUrlOnly: true });
      if (key === 'image') addUrlReferences(references, fieldValue, 'image', imetaMimeType, { forceUrlOnly: true });
      if (key === 'fallback')
        addUrlReferences(references, fieldValue, 'fallback', imetaMimeType, { forceUrlOnly: true });
      if (key === 'mirror') addUrlReferences(references, fieldValue, 'mirror', imetaMimeType, { forceUrlOnly: true });
    }
  }

  // ── Phase 2: generic tag scanning ───────────────────────────────────────
  // Every tag value that looks like a URL is checked for a SHA256 hash.
  // URL-only references are only created if the URL is on a known server.
  for (const tag of event.tags) {
    const name = tag[0];
    if (EXPLICIT_TAG_NAMES.has(name)) continue; // already handled in phase 1
    for (let i = 1; i < tag.length; i++) {
      const val = tag[i];
      if (typeof val === 'string' && isUrl(val)) {
        addUrlReferences(references, val, name, eventMimeType, { knownServerUrls: knownServerBaseUrls });
      }
    }
  }

  // ── Phase 3: content processing ─────────────────────────────────────────
  // Keep the full URL with a hash-bearing content reference. The URL may be
  // a non-Blossom native source, so its reachability is separate from replica
  // operations.
  for (const url of extractUrlsFromText(event.content)) {
    addUrlReferences(references, url, 'content', eventMimeType, { knownServerUrls: knownServerBaseUrls });
  }

  // ── Deduplicate ─────────────────────────────────────────────────────────
  return references.filter(
    (reference, index, all) =>
      all.findIndex(
        candidate =>
          candidate.sha256 === reference.sha256 && candidate.url === reference.url && candidate.role === reference.role
      ) === index
  );
}
