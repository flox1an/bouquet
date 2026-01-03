import { FileText, Film, Music, Image } from 'lucide-react';

const MimeTypeIcon = ({ type, className }: { type: string | undefined; className?: string }) => {
  if (!type) return <FileText className={className} />;
  if (type.startsWith('image/')) return <Image className={className} />;
  if (type.startsWith('video/')) return <Film className={className} />;
  if (type.startsWith('audio/')) return <Music className={className} />;
  if (type === 'application/pdf') return <FileText className={className} />;
  return <FileText className={className} />;
};

export default MimeTypeIcon;
