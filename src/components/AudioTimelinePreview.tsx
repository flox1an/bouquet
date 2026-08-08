import { useEffect, useRef, useState } from 'react';
import { Music2 } from 'lucide-react';
import { getCachedId3Tag, type ID3Tag } from '../utils/id3';

type AudioTimelinePreviewItem = { displayTitle: string; primaryBlobSha256?: string };

export function AudioTimelinePreview({
  item,
  metadataVersion = 0,
  sourceUrl,
  onVisible,
}: {
  item: AudioTimelinePreviewItem;
  metadataVersion?: number;
  sourceUrl?: string;
  onVisible?: () => void;
}) {
  const [metadata, setMetadata] = useState<ID3Tag>();
  const previewRef = useRef<HTMLDivElement>(null);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;
  useEffect(() => {
    if (!item.primaryBlobSha256) return;
    let active = true;
    void getCachedId3Tag(item.primaryBlobSha256)
      .then(tag => {
        if (active) setMetadata(tag);
      })
      .catch(() => undefined); // Missing ID3 tags are normal; the card reads fine without them.
    return () => {
      active = false;
    };
  }, [item.primaryBlobSha256, metadataVersion]);

  useEffect(() => {
    if (!item.primaryBlobSha256 || !sourceUrl || !onVisibleRef.current) return;
    const load = () => onVisibleRef.current?.();
    if (!('IntersectionObserver' in window)) {
      load();
      return;
    }
    const observer = new IntersectionObserver(
      entries => {
        if (!entries[0]?.isIntersecting) return;
        load();
        observer.disconnect();
      },
      { rootMargin: '300px 0px' }
    );
    const preview = previewRef.current;
    if (preview) observer.observe(preview);
    return () => observer.disconnect();
  }, [item.primaryBlobSha256, sourceUrl]);

  return (
    <div ref={previewRef} className="relative mb-2 aspect-video overflow-hidden border bg-primary/10">
      <img
        src={metadata?.cover ?? '/music-placeholder.png'}
        alt={metadata?.cover ? `Cover art for ${item.displayTitle}` : ''}
        className="h-full w-full object-cover"
        loading="lazy"
      />
      {!metadata?.cover && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/35">
          <Music2 className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
