import { FileText, Image, Music2, Video } from 'lucide-react';
import type { TimelineProjection, TimelineSortField } from '../../catalog/advanced';

export type TimelineItem = TimelineProjection;
export type TypeFilter = 'all' | 'media' | TimelineItem['displayType'];

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
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Video' },
  { id: 'audio', label: 'Audio' },
  { id: 'document', label: 'Documents' },
  { id: 'unknown', label: 'Unclassified' },
];

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
