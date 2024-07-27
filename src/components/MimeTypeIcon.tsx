import { DocumentIcon, FilmIcon, MusicalNoteIcon, PhotoIcon } from '@heroicons/react/24/outline';

const MimeTypeIcon = ({ type, className }: { type: string | undefined; className?: string }) => {
  if (!type) return <DocumentIcon className={className} />;
  if (type.startsWith('image/')) return <PhotoIcon className={className} />;
  if (type.startsWith('video/')) return <FilmIcon className={className} />;
  if (type.startsWith('audio/')) return <MusicalNoteIcon className={className} />;
  if (type === 'application/pdf') return <DocumentIcon className={className} />;
  return <DocumentIcon className={className} />;
};

export default MimeTypeIcon;
