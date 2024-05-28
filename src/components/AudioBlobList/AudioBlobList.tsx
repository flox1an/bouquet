import { formatFileSize, formatDate } from '../../utils/utils';
import { ClipboardDocumentIcon, TrashIcon } from '@heroicons/react/24/outline';
import { BlobDescriptor } from 'blossom-client-sdk';
import { AudioBlob, fetchId3Tag } from '../../utils/id3';
import { useQueries } from '@tanstack/react-query';
import { useGlobalContext } from '../../GlobalState';
import { PauseIcon, PlayIcon } from '@heroicons/react/24/solid';

type AudioBlobListProps = {
  audioFiles: BlobDescriptor[];
  onDelete?: (blob: BlobDescriptor) => void;
};

const AudioBlobList = ({ audioFiles, onDelete }: AudioBlobListProps) => {
  const { dispatch, state } = useGlobalContext();

  const audioFilesWithId3 = useQueries({
    queries: audioFiles.map(af => ({
      queryKey: ['id3', af.sha256],
      queryFn: async () => {
        const id3Tag = await fetchId3Tag(af.sha256, af.url);
        return { ...af, id3: id3Tag?.id3 } as AudioBlob;
      },
      staleTime: 1000 * 60 * 5,
      cacheTime: 1000 * 60 * 5,
    })),
  });

  return (
    <div className="blob-list grid w-full grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2 justify-center">
      {audioFilesWithId3.map(
        blob =>
          blob.isSuccess && (
            <div key={blob.data.sha256} className="p-4 rounded-lg bg-base-300 w-full relative flex flex-col">
              <div className="flex flex-row gap-4 pb-1">
                <div className="cover-image">
                  <img
                    width={96}
                    height={96}
                    src={blob.data?.id3?.cover || '/music-placeholder.png'}
                    className="cursor-pointer rounded-md w-[64px] h-[64px] md:w-[96px] md:h-[96px]"
                    onClick={() =>
                      dispatch({ type: 'SET_CURRENT_SONG', song: { url: blob.data.url, id3: blob.data.id3 } })
                    }
                  />
                  {state.currentSong?.url == blob.data.url ? (
                    <PauseIcon
                      className="pause-icon"
                      onClick={() => dispatch({ type: 'RESET_CURRENT_SONG' })}
                    ></PauseIcon>
                  ) : (
                    <PlayIcon
                      className="play-icon"
                      onClick={() =>
                        dispatch({ type: 'SET_CURRENT_SONG', song: { url: blob.data.url, id3: blob.data.id3 } })
                      }
                    ></PlayIcon>
                  )}
                </div>
                {blob.data.id3 && (
                  <div className="flex flex-col pb-1 md:pb-4 flex-grow">
                    {blob.data.id3.title && <span className="font-bold">{blob.data.id3.title}</span>}
                    {blob.data.id3.artist && <span className=" text-sm"> {blob.data.id3.artist}</span>}
                    {blob.data.id3.album && (
                      <span className="text-sm">
                        {blob.data.id3.album} {blob.data.id3.year ? `(${blob.data.id3.year})` : ''}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-grow flex-row text-xs items-end">
                <span>{formatFileSize(blob.data.size)}</span>
                <span className=" flex-grow text-right">{formatDate(blob.data.uploaded)}</span>
              </div>
              <div className="actions absolute bottom-10 right-2 ">
                <span>
                  <a
                    className="link link-primary tooltip"
                    data-tip="Copy link to clipboard"
                    onClick={() => navigator.clipboard.writeText(blob.data.url)}
                  >
                    <ClipboardDocumentIcon />
                  </a>
                </span>
                {onDelete && (
                  <span>
                    <a
                      onClick={() => onDelete(blob.data)}
                      className="link link-primary tooltip"
                      data-tip="Delete this blob"
                    >
                      <TrashIcon />
                    </a>
                  </span>
                )}
              </div>
            </div>
          )
      )}
    </div>
  );
};

export default AudioBlobList;
