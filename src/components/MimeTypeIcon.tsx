import { FileText, Film, Music, Image } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const MimeTypeIcon = ({ type, className }: { type: string | undefined; className?: string }) => {
  const cls = cn('h-3.5 w-3.5 shrink-0 text-muted-foreground', className);

  let icon: React.ReactNode;
  if (!type) icon = <FileText className={cls} />;
  else if (type.startsWith('image/')) icon = <Image className={cls} />;
  else if (type.startsWith('video/')) icon = <Film className={cls} />;
  else if (type.startsWith('audio/')) icon = <Music className={cls} />;
  else icon = <FileText className={cls} />;

  if (!type) return <>{icon}</>;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{icon}</span>
      </TooltipTrigger>
      <TooltipContent>{type}</TooltipContent>
    </Tooltip>
  );
};

export default MimeTypeIcon;
