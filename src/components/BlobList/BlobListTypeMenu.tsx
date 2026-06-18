import { List, Image, Music, Film, FileText, GitBranch } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ListMode = 'gallery' | 'list' | 'audio' | 'video' | 'docs' | 'relationships';

type BlobListTypeMenuProps = {
  setMode: React.Dispatch<React.SetStateAction<ListMode>>;
  mode: string;
  hasImages: boolean;
  hasAudio: boolean;
  hasVideo: boolean;
  hasDocs: boolean;
};

const BlobListTypeMenu = ({ mode, setMode, hasImages, hasAudio, hasDocs, hasVideo }: BlobListTypeMenuProps) => {
  useEffect(() => {
    switch (mode) {
      case 'video':
        if (!hasVideo) setMode('list');
        break;
      case 'audio':
        if (!hasAudio) setMode('list');
        break;
      case 'gallery':
        if (!hasImages) setMode('list');
        break;
      case 'docs':
        if (!hasDocs) setMode('list');
        break;
    }
  }, [hasAudio, hasDocs, hasImages, hasVideo, mode, setMode]);

  const items = [
    { id: 'list' as ListMode, icon: List, label: 'All content', enabled: true },
    { id: 'gallery' as ListMode, icon: Image, label: 'Images', enabled: hasImages },
    { id: 'audio' as ListMode, icon: Music, label: 'Music', enabled: hasAudio },
    { id: 'video' as ListMode, icon: Film, label: 'Video', enabled: hasVideo },
    { id: 'docs' as ListMode, icon: FileText, label: 'PDF documents', enabled: hasDocs },
    { id: 'relationships' as ListMode, icon: GitBranch, label: 'Relationships', enabled: true },
  ];

  return (
    <div className="inline-flex items-center rounded-lg border bg-muted p-1">
      {items.map(item => {
        const Icon = item.icon;
        const isActive = mode === item.id;
        return (
          <Button
            key={item.id}
            variant="ghost"
            size="sm"
            disabled={!item.enabled}
            title={item.label}
            onClick={() => setMode(item.id)}
            className={cn(
              'h-8 w-8 p-0',
              isActive && 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
          </Button>
        );
      })}
    </div>
  );
};

export default BlobListTypeMenu;
