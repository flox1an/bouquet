import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Renders Nostr text content with its entities as links: nostr: entities
 * (npub/nprofile/note/nevent/naddr) point at their canonical page, URLs open in
 * a new tab, hashtags search Browse. Plain text stays plain - no auto-embeds.
 */
const TOKEN = /(nostr:(?:npub|nprofile|note|nevent|naddr)1[0-9a-z]+)|(https?:\/\/[^\s<>"]+)|(#[\p{L}\p{N}_]+)/gu;

export function NostrText({ text }: { text: string }) {
  return <>{tokenize(text)}</>;
}

function tokenize(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(<Fragment key={`t${index}`}>{text.slice(last, index)}</Fragment>);
    const [raw, nostrEntity, url, hashtag] = match;
    if (nostrEntity) {
      const value = nostrEntity.slice('nostr:'.length);
      nodes.push(
        <a
          key={`n${index}`}
          href={`https://njump.me/${value}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {value.slice(0, 16)}…
        </a>
      );
    } else if (url) {
      nodes.push(
        <a key={`u${index}`} href={url} target="_blank" rel="noopener noreferrer" className="underline">
          {url.replace(/^https?:\/\//, '')}
        </a>
      );
    } else if (hashtag) {
      nodes.push(
        <Link key={`h${index}`} to={`/browse?search=${encodeURIComponent(hashtag.slice(1))}`} className="underline">
          {hashtag}
        </Link>
      );
    }
    last = index + raw.length;
  }
  if (last < text.length) nodes.push(<Fragment key="tail">{text.slice(last)}</Fragment>);
  return nodes;
}
