import { useEffect, useMemo, useState } from 'react';
import type { TimelineProjection } from '../catalog/advanced';

const IMAGE_PROXY_URL = 'https://imgproxy.nostu.be';

type ThumbnailSource = {
  url: string;
  kind: 'image' | 'video';
};

function proxiedThumbnailUrl(url: string): string {
  if (url.startsWith('data:')) return url;
  return `${IMAGE_PROXY_URL}/insecure/f:webp/rs:fit:480:480/plain/${encodeURIComponent(url)}`;
}

function sourcesFor(item: Pick<TimelineProjection, 'displayType' | 'previewUrl' | 'primaryUrl'>): ThumbnailSource[] {
  if (item.displayType === 'image') {
    const imageUrl = item.previewUrl ?? item.primaryUrl;
    return imageUrl ? [{ url: proxiedThumbnailUrl(imageUrl), kind: 'image' }, { url: imageUrl, kind: 'image' }] : [];
  }
  if (item.displayType === 'video') {
    const previewSources = item.previewUrl
      ? [{ url: proxiedThumbnailUrl(item.previewUrl), kind: 'image' as const }, { url: item.previewUrl, kind: 'image' as const }]
      : [];
    const videoFrame = item.primaryUrl && item.primaryUrl !== item.previewUrl
      ? [{ url: proxiedThumbnailUrl(item.primaryUrl), kind: 'video' as const }]
      : [];
    return [...previewSources, ...videoFrame];
  }
  return [];
}

export function TimelineThumbnail({ item }: { item: Pick<TimelineProjection, 'displayType' | 'displayTitle' | 'previewUrl' | 'primaryUrl'> }) {
  const sources = useMemo(() => sourcesFor(item), [item]);
  const [sourceIndex, setSourceIndex] = useState(0);
  const source = sources[sourceIndex];

  useEffect(() => {
    setSourceIndex(0);
  }, [sources]);

  if (!source) return null;

  return (
    <div className="mb-2 aspect-video overflow-hidden border bg-muted">
      <img
        src={source.url}
        alt={`${item.displayTitle} ${source.kind === 'video' ? 'video frame' : 'thumbnail'}`}
        className="h-full w-full object-cover"
        loading="lazy"
        onError={() => setSourceIndex(index => index + 1)}
      />
    </div>
  );
}
