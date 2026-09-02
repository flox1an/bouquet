import { useEffect, useMemo, useState } from 'react';
import { ImageOff } from 'lucide-react';
import type { TimelineProjection } from '../catalog/advanced';

const IMGPROXY_BASE_URL = 'https://imgproxy.nostu.be';

/** imgproxy has no route to `.fips` hosts - a local/dev-only domain suffix, not a
    public address - so passing one as an `xs` hint just wastes the fetch attempt. */
function isUnsupportedThumbnailHost(host: string): boolean {
  return /\.fips(:|$)/i.test(host);
}

/** Build the fixed preset URL for hash-addressed Blossom media; anything else
    falls back to the unsigned /insecure/ route with the same visual output
    (fit 480x480, q82, webp) — mirrors nostube's preset-thumbnail-url.ts. */
function proxiedThumbnailUrl(url: string, authorPubkey?: string, knownServers: readonly string[] = []): string {
  if (url.startsWith('data:')) return url;
  const blossom = parseBlossomUrl(url);
  if (blossom) {
    // Other servers the user's own listing already confirmed hold this blob. Most
    // useful for a mirrored blob whose event was posted by someone else, where the
    // URL's host is a stranger and the confirmed server is the one worth trying next.
    const hosts = [...new Set([blossom.host, ...knownServers])].filter(host => !isUnsupportedThumbnailHost(host));
    // Nothing left to point the proxy at; the plain URL is the next fallback source.
    if (hosts.length === 0) return url;
    const filename = blossom.ext ? `${blossom.sha256}.${blossom.ext}` : blossom.sha256;
    const proxyUrl = new URL(`${IMGPROXY_BASE_URL}/v1/preset/feed-preview-v1/${filename}`);
    for (const host of hosts) proxyUrl.searchParams.append('xs', host);
    if (authorPubkey) proxyUrl.searchParams.set('as', authorPubkey);
    return proxyUrl.toString();
  }
  return `${IMGPROXY_BASE_URL}/insecure/f:webp/q:82/rs:fit:480:480/plain/${encodeURIComponent(url)}`;
}
/** Extract sha256 + extension from a hash-addressed Blossom URL (https://host/<64hex>[.ext]). */
function parseBlossomUrl(url: string): { sha256: string; ext?: string; host: string } | undefined {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/([0-9a-f]{64})(?:\.(\w+))?$/);
    if (!match) return undefined;
    return { sha256: match[1], ext: match[2], host: parsed.host };
  } catch {
    return undefined;
  }
}

type ThumbnailSource = {
  url: string;
  kind: 'image' | 'video';
};

type ThumbnailItem = Pick<
  TimelineProjection,
  'displayType' | 'previewUrl' | 'primaryUrl' | 'eventAuthor' | 'previewBlobSha256' | 'primaryBlobSha256'
>;
/** Servers already confirmed (via the user's own server listing) to hold a blob. */
export type KnownServersFor = (sha256: string | undefined) => readonly string[];

function sourcesFor(item: ThumbnailItem, knownServersFor: KnownServersFor): ThumbnailSource[] {
  const proxied = (url: string, sha256: string | undefined) =>
    proxiedThumbnailUrl(url, item.eventAuthor, knownServersFor(sha256));
  if (item.displayType === 'image') {
    const imageUrl = item.previewUrl ?? item.primaryUrl;
    const sha256 = item.previewUrl ? item.previewBlobSha256 : item.primaryBlobSha256;
    return imageUrl
      ? [
          { url: proxied(imageUrl, sha256), kind: 'image' },
          { url: imageUrl, kind: 'image' },
        ]
      : [];
  }
  if (item.displayType === 'video') {
    const previewSources = item.previewUrl
      ? [
          { url: proxied(item.previewUrl, item.previewBlobSha256), kind: 'image' as const },
          { url: item.previewUrl, kind: 'image' as const },
        ]
      : [];
    const videoFrame =
      item.primaryUrl && item.primaryUrl !== item.previewUrl
        ? [{ url: proxied(item.primaryUrl, item.primaryBlobSha256), kind: 'video' as const }]
        : [];
    return [...previewSources, ...videoFrame];
  }
  return [];
}

const NO_KNOWN_SERVERS: KnownServersFor = () => [];

export function TimelineThumbnail({
  item,
  knownServersFor = NO_KNOWN_SERVERS,
  fill = false,
}: {
  item: ThumbnailItem & Pick<TimelineProjection, 'displayTitle'>;
  knownServersFor?: KnownServersFor;
  /** Fill the parent box (square timeline card) instead of rendering the inline
      16:9 box: the image is contained and a blurred copy of itself backs it, so
      portrait and landscape media both read as a full-bleed square. */
  fill?: boolean;
}) {
  const sources = useMemo(() => sourcesFor(item, knownServersFor), [item, knownServersFor]);
  // Content, not array identity: `item` is rebuilt on every background catalog
  // refresh, so a new-but-equal `sources` array here used to restart the
  // fallback chain from source 0 on every such refresh - replaying the same
  // fetch-then-404 cycle against a URL already known to fail, which is the
  // "very many retries" and the flapping between a loaded and a blank thumbnail.
  const sourcesKey = sources.map(source => source.url).join('|');
  const [sourceIndex, setSourceIndex] = useState(0);
  const source = sources[sourceIndex];

  useEffect(() => {
    setSourceIndex(0);
  }, [sourcesKey]);

  // Fixed-size box always renders, loaded or not - the grid/list virtualizer
  // measures this element's height, and a thumbnail that disappears while every
  // source is still being tried (or has failed for good) shrinks the row, which
  // is what was making the list jump and the scroll position drift.
  if (!fill) {
    return (
      <div className="mb-2 flex aspect-video items-center justify-center overflow-hidden border bg-muted">
        {source ? (
          <img
            key={source.url}
            src={source.url}
            // Empty on purpose: the card names the item right below this box, so a
            // decorative preview repeating that name only spills text across the tile
            // while the image is still loading or has failed.
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setSourceIndex(index => index + 1)}
          />
        ) : (
          <ImageOff className="h-6 w-6 text-muted-foreground/50" aria-label="Thumbnail unavailable" />
        )}
      </div>
    );
  }
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-muted">
      {/* Blurred copy of the same source fills the square behind the contained
          image. Same URL as the main image, so the browser fetches it once; no
          onError here - the main image below drives the fallback chain, and a
          second handler would skip a source on every failure. */}
      {source && (
        <img
          key={`backdrop-${source.url}`}
          src={source.url}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl"
          loading="lazy"
        />
      )}
      {source ? (
        <img
          key={source.url}
          src={source.url}
          alt=""
          className="relative h-full w-full object-contain"
          loading="lazy"
          onError={() => setSourceIndex(index => index + 1)}
        />
      ) : (
        <ImageOff className="h-6 w-6 text-muted-foreground/50" aria-label="Thumbnail unavailable" />
      )}
    </div>
  );
}
