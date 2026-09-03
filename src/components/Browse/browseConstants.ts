import { FileText, Image, Music2, Video } from 'lucide-react';
import type { TimelineProjection, TimelineSortField } from '../../catalog/advanced';

export type TimelineItem = TimelineProjection;
export type TypeFilter = 'all' | 'media' | 'website' | TimelineItem['displayType'];

export const TYPE_ICON = {
  image: Image,
  video: Video,
  audio: Music2,
  document: FileText,
  unknown: FileText,
};

export const TYPE_FILTERS: Array<{ id: TypeFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'media', label: 'Media' },
  { id: 'website', label: 'Website' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'document', label: 'Documents' },
  { id: 'unknown', label: 'Unclassified' },
];

const WEBSITE_EVENT_KINDS = new Set([5128, 15128, 34128, 35128]);

export function matchesTypeFilter(item: TimelineItem, filter: TypeFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'media') return item.displayType !== 'unknown';
  if (filter === 'website') return item.eventKind !== undefined && WEBSITE_EVENT_KINDS.has(item.eventKind);
  return item.displayType === filter;
}

export const AVAILABILITY_LABEL = {
  complete: '✅ Available',
  partial: 'Partially available',
  unavailable: 'Unavailable',
  unknown: 'Not checked',
};

export const SORT_FIELD_OPTIONS: Array<{ id: TimelineSortField; label: string }> = [
  { id: 'date', label: 'Date' },
  { id: 'title', label: 'Title' },
  { id: 'size', label: 'Size' },
  { id: 'blobCount', label: 'File count' },
  { id: 'replicaCount', label: 'Copies' },
];

/**
 * One file published by one author as several events - a note plus a video event,
 * or a file descriptor created twice by a re-upload - folds into its richest event:
 * the one carrying the most files, then a real title, then the newest date. Items
 * without a file hash or an author (unlinked files) never group.
 */
export function groupRepeatedPosts(items: TimelineItem[]): TimelineItem[] {
  const representative = new Map<string, TimelineItem>();
  for (const item of items) {
    if (!item.primaryBlobSha256 || !item.eventAuthor) continue;
    const key = `${item.primaryBlobSha256}:${item.eventAuthor}`;
    const current = representative.get(key);
    if (!current || isRicher(item, current)) representative.set(key, item);
  }
  return items.filter(
    item =>
      !item.primaryBlobSha256 ||
      !item.eventAuthor ||
      representative.get(`${item.primaryBlobSha256}:${item.eventAuthor}`) === item
  );
}

function isRicher(candidate: TimelineItem, incumbent: TimelineItem): boolean {
  const rank = (item: TimelineItem): [number, number, number] => [
    item.blobCount ?? 0,
    item.displayTitleIsFallback ? 0 : 1,
    item.displayDate ?? 0,
  ];
  const left = rank(candidate);
  const right = rank(incumbent);
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return left[i] > right[i];
  return false; // full tie: the earlier item in list order stays representative
}
