import { useEffect, useState } from 'react';
import { formatFileSize } from '../../utils/utils';
import { fetchId3Tag } from '../../utils/id3';
import useVideoThumbnailDvm from './dvm';
import { usePublishing } from './usePublishing';

export type FileEventData = {
  originalFile: File;
  content: string;
  url: string[];
  dim?: string;
  x: string;
  m?: string;
  size: number;
  thumbnails?: string[];
  thumbnail?: string;
  //summary: string;
  //alt: string;

  artist?: string;
  title?: string;
  album?: string;
  year?: string;
};

const FileEventEditor = ({ data }: { data: FileEventData }) => {
  const [fileEventData, setFileEventData] = useState(data);
  const { createDvmThumbnailRequest, thumbnailRequestEventId } = useVideoThumbnailDvm(setFileEventData);
  const { publishAudioEvent, publishFileEvent, publishVideoEvent } = usePublishing();
  const [jsonOutput, setJsonOutput] = useState('');

  useEffect(() => {
    if (fileEventData.m?.startsWith('video/') && fileEventData.thumbnails == undefined) {
      createDvmThumbnailRequest(fileEventData);
    }
    if (
      fileEventData.m?.startsWith('audio/') &&
      !(
        fileEventData.title ||
        fileEventData.artist ||
        fileEventData.album ||
        fileEventData.year ||
        fileEventData.thumbnail
      )
    ) {
      console.log('getting id3 cover image', fileEventData.x, fileEventData.url[0], fileEventData.originalFile);
      fetchId3Tag(fileEventData.x, fileEventData.url[0], fileEventData.originalFile).then(res => {
        if (!res) return;

        const { id3 } = res;
        console.log(res.coverFull);
        setFileEventData({
          ...fileEventData,
          artist: id3.artist,
          album: id3.album,
          title: id3.title,
          year: id3.year,
          thumbnail: res.coverFull,
          thumbnails: res.coverFull ? [res.coverFull] : [],
        });
      });
    }
  }, [fileEventData]);

  return (
    <>
      <div className=" bg-base-200 rounded-xl p-4 text-neutral-content gap-4 flex flex-row">
        {fileEventData.m?.startsWith('video/') && (
          <>
            {thumbnailRequestEventId &&
              (fileEventData.thumbnails && fileEventData.thumbnails.length > 0 ? (
                <div className="w-2/6">
                  <div className="carousel w-full">
                    {fileEventData.thumbnails.map((t, i) => (
                      <div id={`item${i + 1}`} key={`item${i + 1}`} className="carousel-item w-full">
                        <img src={t} className="w-full" />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-center w-full py-2 gap-2">
                    {fileEventData.thumbnails.map((t, i) => (
                      <a
                        key={`link${i + 1}`}
                        href={`#item${i + 1}`}
                        onClick={() => setFileEventData(ed => ({ ...ed, thumbnail: t }))}
                        className={'btn btn-xs ' + (t == fileEventData.thumbnail ? 'btn-primary' : '')}
                      >{`${i + 1}`}</a>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  Creating previews <span className="loading loading-spinner loading-md"></span>
                </div>
              ))}
          </>
        )}
        {fileEventData.m?.startsWith('audio/') && fileEventData.thumbnail && (
          <div className="w-2/6">
            <img src={fileEventData.thumbnail} className="w-full" />
          </div>
        )}

        {fileEventData.m?.startsWith('image/') && (
          <div className="p-4 bg-base-300 w-2/6">
            <img
              width={300}
              height={300}
              src={`https://images.slidestr.net/insecure/f:webp/rs:fill:300/plain/${fileEventData.url[0]}`}
            ></img>
          </div>
        )}
        <div className="grid gap-4 w-4/6" style={{ gridTemplateColumns: '1fr 30em' }}>
          {fileEventData.title && (
            <>
              <span className="font-bold">Title</span>
              <span>{fileEventData.title}</span>
            </>
          )}
          {fileEventData.artist && (
            <>
              <span className="font-bold">Artist</span>
              <span>{fileEventData.artist}</span>
            </>
          )}
          {fileEventData.album && (
            <>
              <span className="font-bold">Album</span>
              <span>{fileEventData.album}</span>
            </>
          )}
          {fileEventData.year && (
            <>
              <span className="font-bold">Year</span>
              <span>{fileEventData.year}</span>
            </>
          )}

          <span className="font-bold">Type</span>
          <span>{fileEventData.m}</span>

          {fileEventData.dim && (
            <>
              <span className="font-bold">Dimensions</span>
              <span>{fileEventData.dim}</span>
            </>
          )}

          <span className="font-bold">File size</span>
          <span>{fileEventData.size ? formatFileSize(fileEventData.size) : 'unknown'}</span>
          <span className="font-bold">Content / Description</span>
          <textarea
            value={fileEventData.content}
            onChange={e => setFileEventData(ed => ({ ...ed, content: e.target.value }))}
            className="textarea"
            placeholder="Caption"
          ></textarea>
          <span className="font-bold">URL</span>
          <div className="">
            {fileEventData.url.map((text, i) => (
              <div key={i} className="break-words mb-2">
                {text}
              </div>
            ))}
          </div>
        </div>
      </div>{' '}
      <div className="flex gap-2 flex-col">
        <div className=" alert alert-warning ">
          DEVELOPMENT ZONE! These publish buttons do not work yet. Events are only shown in the browser console.
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-primary"
            onClick={async () => setJsonOutput(await publishFileEvent(fileEventData))}
          >
            Create File Event
          </button>
          <button
            className="btn btn-primary"
            onClick={async () => setJsonOutput(await publishAudioEvent(fileEventData))}
          >
            Create Audio Event
          </button>
          <button
            className="btn btn-primary"
            onClick={async () => setJsonOutput(await publishVideoEvent(fileEventData))}
          >
            Create Video Event
          </button>
        </div>
        <div className="font-mono text-xs whitespace-pre">{jsonOutput}</div>
      </div>
    </>
  );
};

export default FileEventEditor;
