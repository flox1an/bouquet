import { useMemo } from 'react';
import { formatFileSize, formatDate } from '../../utils/utils';
import { Clipboard, Pause, Play } from 'lucide-react';
import { BlobDescriptor } from 'blossom-client-sdk';
import { AudioBlob, ID3Tag, fetchId3Tag } from '../../utils/id3';
import { useQueries } from '@tanstack/react-query';
import { useGlobalContext } from '../../GlobalState';
import { HandleSelectBlobType } from '../BlobList/useBlobSelection';
import { Checkbox } from '@/components/ui/checkbox';
import { Pagination, usePagination } from '@/components/ui/pagination';
import { Button } from '@/components/ui/button';

type AudioBlobListProps = {
  audioFiles: BlobDescriptor[];
  handleSelectBlob: HandleSelectBlobType;
  selectedBlobs: { [key: string]: boolean };
};

const AudioBlobList = ({ audioFiles, handleSelectBlob, selectedBlobs }: AudioBlobListProps) => {
  const { dispatch, state } = useGlobalContext();

  const {
    currentPage,
    setCurrentPage,
    pageSize,
    totalPages,
    startIndex,
    endIndex,
    handlePageSizeChange,
  } = usePagination(audioFiles.length);

  const paginatedAudioFiles = useMemo(
    () => audioFiles.slice(startIndex, endIndex),
    [audioFiles, startIndex, endIndex]
  );

  const audioFilesWithId3 = useQueries({
    queries: paginatedAudioFiles.map(af => ({
      queryKey: ['id3', af.sha256],
      queryFn: async () => {
        let id3Tag:
          | {
              id3: ID3Tag;
              coverFull?: string | undefined;
            }
          | undefined;
        try {
          id3Tag = await fetchId3Tag(af.sha256, af.url);
        } catch {
          // ignore
        }
        return { ...af, id3: id3Tag?.id3 } as AudioBlob;
      },
      staleTime: 1000 * 60 * 5,
      cacheTime: 1000 * 60 * 5,
    })),
  });

  return (
    <>
      <div className="blob-list grid w-full grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2 justify-center">
        {audioFilesWithId3.map(
          blob =>
            blob.isSuccess && (
              <div key={blob.data.sha256} className="p-4 rounded-lg bg-muted w-full relative flex flex-col">
                <div className="flex flex-row gap-4 pb-1">
                  <div className="cover-image relative group">
                    <img
                      width={96}
                      height={96}
                      src={blob.data?.id3?.cover || '/music-placeholder.png'}
                      className="cursor-pointer rounded-md w-[64px] h-[64px] md:w-[96px] md:h-[96px]"
                      onClick={() =>
                        dispatch({ type: 'SET_CURRENT_SONG', song: { url: blob.data.url, id3: blob.data.id3 } })
                      }
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      {state.currentSong?.url == blob.data.url ? (
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-10 w-10 rounded-full opacity-80 hover:opacity-100"
                          onClick={() => dispatch({ type: 'RESET_CURRENT_SONG' })}
                        >
                          <Pause className="h-5 w-5" />
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-10 w-10 rounded-full opacity-0 group-hover:opacity-80 hover:opacity-100 transition-opacity"
                          onClick={() =>
                            dispatch({ type: 'SET_CURRENT_SONG', song: { url: blob.data.url, id3: blob.data.id3 } })
                          }
                        >
                          <Play className="h-5 w-5" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {blob.data.id3 && (
                    <div className="flex flex-col pb-1 md:pb-4 flex-grow min-w-0">
                      {blob.data.id3.title && <span className="text-primary truncate">{blob.data.id3.title}</span>}
                      {blob.data.id3.artist && <span className="text-sm truncate">{blob.data.id3.artist}</span>}
                      {blob.data.id3.album && (
                        <span className="text-sm text-muted-foreground truncate">
                          {blob.data.id3.album} {blob.data.id3.year ? `(${blob.data.id3.year})` : ''}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div
                  className="flex flex-grow flex-row text-xs items-center mt-2 cursor-pointer"
                  onClick={e => {
                    e.stopPropagation();
                    handleSelectBlob(blob.data.sha256, e);
                  }}
                >
                  <Checkbox
                    className="mr-2"
                    checked={selectedBlobs[blob.data.sha256]}
                    onCheckedChange={() => handleSelectBlob(blob.data.sha256)}
                    onClick={e => e.stopPropagation()}
                  />

                  <span>{formatFileSize(blob.data.size)}</span>
                  <span className="flex-grow text-right">{formatDate(blob.data.uploaded)}</span>
                </div>
                <div className="absolute bottom-10 right-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Copy link to clipboard"
                    onClick={() => navigator.clipboard.writeText(blob.data.url)}
                  >
                    <Clipboard className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )
        )}
      </div>

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={pageSize}
        totalItems={audioFiles.length}
        startIndex={startIndex}
        endIndex={endIndex}
        onPageChange={setCurrentPage}
        onPageSizeChange={handlePageSizeChange}
      />
    </>
  );
};

export default AudioBlobList;
