import type { EventTemplate } from 'blossom-client-sdk';

/** NIP-56 report types (BUD-09 x-tag third value). */
export const REPORT_TYPES = ['nudity', 'malware', 'profanity', 'illegal', 'spam', 'other'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export function buildReportTemplate(options: {
  hashes: string[];
  type: ReportType;
  content: string;
  /** Nostr event context the blob was found in (BUD-09: optional e/p tags). */
  event?: { id: string; pubkey?: string };
}): EventTemplate {
  const tags: string[][] = options.hashes.map(hash => ['x', hash, options.type]);
  if (options.event) {
    tags.push(['e', options.event.id]);
    if (options.event.pubkey) tags.push(['p', options.event.pubkey]);
  }
  return { kind: 1984, created_at: Math.floor(Date.now() / 1000), tags, content: options.content };
}
