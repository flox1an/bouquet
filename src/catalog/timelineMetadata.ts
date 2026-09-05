import type { NostrEvent } from 'nostr-tools';
import { fallbackEventTitle } from './eventKinds';

export type TimelineEventMetadata = {
  author: string;
  dTag?: string;
  eventId: string;
  kind: number;
  createdAt: number;
  title: string;
  titleIsFallback: boolean;
  subtitle?: string;
  searchText: string;
};

const TITLE_TAGS = ['title', 'name', 'subject'];
const SUMMARY_TAGS = ['summary', 'description', 'alt'];

function firstTagValue(event: Pick<NostrEvent, 'tags'>, names: string[]): string | undefined {
  for (const name of names) {
    const value = event.tags.find(tag => tag[0] === name)?.[1]?.trim();
    if (value) return value;
  }
}

function imetaValues(event: NostrEvent): string[] {
  return event.tags
    .filter(tag => tag[0] === 'imeta')
    .flatMap(tag => tag.slice(1))
    .map(field => field.slice(field.indexOf(' ') + 1).trim())
    .filter(Boolean);
}

function conciseContent(content: string): string | undefined {
  const text = content.trim();
  if (!text || /^https?:\/\/\S+$/.test(text)) return undefined;
  return text;
}

const BODY_TAG_NAMES = ['description', 'summary'];
const MEDIA_KINDS = new Set([20, 21, 22, 31337, 34235, 34236]);

/**
 * The text body the detail view renders below the media: a note's content is its
 * body; media kinds describe themselves in description/summary tags and fall back
 * to content. Plain file events carry no prose worth rendering.
 */
export function eventBody(event: Pick<NostrEvent, 'kind' | 'content' | 'tags'>): string | undefined {
  if (event.kind === 1) return conciseContent(event.content);
  if (!MEDIA_KINDS.has(event.kind)) return undefined;
  return firstTagValue(event, BODY_TAG_NAMES) ?? conciseContent(event.content);
}

export function extractTimelineEventMetadata(event: NostrEvent): TimelineEventMetadata {
  const imeta = imetaValues(event);
  const titleTag = firstTagValue(event, TITLE_TAGS);
  const contentTitle = conciseContent(event.content);
  const titleIsFallback = !titleTag && !contentTitle;
  const title = titleTag ?? contentTitle ?? fallbackEventTitle(event.kind);
  const subtitle =
    firstTagValue(event, SUMMARY_TAGS) ?? (title !== event.content.trim() ? conciseContent(event.content) : undefined);
  const searchableTags = event.tags
    .filter(tag => [...TITLE_TAGS, ...SUMMARY_TAGS, 'imeta'].includes(tag[0]))
    .flatMap(tag => tag.slice(1));
  const searchText = [title, subtitle, event.content, ...searchableTags, ...imeta, event.id]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();

  return {
    eventId: event.id,
    kind: event.kind,
    createdAt: event.created_at,
    author: event.pubkey,
    dTag: event.tags.find(tag => tag[0] === 'd')?.[1],
    title,
    titleIsFallback,
    subtitle,
    searchText,
  };
}
