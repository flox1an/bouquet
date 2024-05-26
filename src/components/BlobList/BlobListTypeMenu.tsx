import { DocumentIcon, FilmIcon, ListBulletIcon, MusicalNoteIcon, PhotoIcon } from '@heroicons/react/24/outline';
import { useEffect } from 'react';

export type ListMode = 'gallery' | 'list' | 'audio' | 'video' | 'docs';

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

  return (
    <ul className="menu menu-horizontal menu-active bg-base-200 rounded-box gap-1">
      <li>
        <a
          className={' tooltip ' + (mode == 'list' ? 'bg-primary text-primary-content hover:bg-primary ' : '')}
          data-tip="All content"
          onClick={() => setMode('list')}
        >
          <ListBulletIcon />
        </a>
      </li>

      <li className={hasImages ? '' : 'disabled'}>
        <a
          className={' tooltip ' + (mode == 'gallery' ? 'bg-primary text-primary-content hover:bg-primary ' : '')}
          onClick={() => setMode('gallery')}
          data-tip="Images"
        >
          <PhotoIcon />
        </a>
      </li>

      <li className={hasAudio ? '' : 'disabled'}>
        <a
          className={' tooltip  ' + (mode == 'audio' ? 'bg-primary text-primary-content hover:bg-primary ' : '')}
          onClick={() => setMode('audio')}
          data-tip="Music"
        >
          <MusicalNoteIcon />
        </a>
      </li>

      <li className={hasVideo ? '' : 'disabled'}>
        <a
          className={' tooltip ' + (mode == 'video' ? 'bg-primary text-primary-content hover:bg-primary ' : '')}
          onClick={() => setMode('video')}
          data-tip="Video"
        >
          <FilmIcon />
        </a>
      </li>

      <li className={hasDocs ? '' : 'disabled'}>
        <a
          className={' tooltip ' + (mode == 'docs' ? 'bg-primary text-primary-content hover:bg-primary ' : '')}
          onClick={() => setMode('docs')}
          data-tip="PDF documents"
        >
          <DocumentIcon />
        </a>
      </li>
    </ul>
  );
};

export default BlobListTypeMenu;
