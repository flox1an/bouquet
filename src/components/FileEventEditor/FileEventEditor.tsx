import { useEffect } from 'react';
import { extractDomain, formatFileSize } from '../../utils/utils';
import { fetchId3Tag } from '../../utils/id3';
import useVideoThumbnailDvm from './dvm';
import TagInput from '../TagInput';
import { allGenres } from '../../utils/genres';
import { ServerIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import MimeTypeIcon from '../MimeTypeIcon';
import { NostrEvent } from '@nostr-dev-kit/ndk';

export type FileEventData = {
  originalFile: File;
  content: string;
  url: string[];
  width?: number;
  height?: number;
  dim?: string;
  x: string;
  m?: string;
  size: number;
  thumbnails?: string[];
  selectedThumbnail?: string;
  publishedThumbnail?: string;
  blurHash?: string;
  tags: string[];
  duration?: string;

  artist?: string;
  title?: string;
  album?: string;
  year?: string;
  genre?: string;
  subgenre?: string;

  publish: {
    file?: boolean;
    audio?: boolean;
    video?: boolean;
  };
  events: NostrEvent[];
};

const copyToClipboard = (text: string) => {
  navigator.clipboard
    .writeText(text)
    .then(() => {})
    .catch(err => {
      console.error('Failed to copy: ', err);
    });
};

const FileEventEditor = ({
  fileEventData,
  setFileEventData,
}: {
  fileEventData: FileEventData;
  setFileEventData: (fe: FileEventData) => void;
}) => {
  const { createDvmThumbnailRequest, thumbnailRequestEventId } = useVideoThumbnailDvm(fileEventData, setFileEventData);

  const isAudio = fileEventData.m?.startsWith('audio/');
  const isVideo = fileEventData.m?.startsWith('video/');
  const isImage = fileEventData.m?.startsWith('image/');

  useEffect(() => {
    if (isVideo && fileEventData.thumbnails == undefined) {
      createDvmThumbnailRequest(fileEventData);
    }
    if (
      fileEventData.m?.startsWith('audio/') &&
      !(
        fileEventData.title ||
        fileEventData.artist ||
        fileEventData.album ||
        fileEventData.year ||
        fileEventData.publishedThumbnail
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
          thumbnails: res.coverFull ? [res.coverFull] : [],
          selectedThumbnail: res.coverFull,
        });
      });
    }
  }, [fileEventData]);

  const getProxyUrl = (url: string) => {
    if (url.startsWith('blob:')) {
      return url;
    }
    return `https://images.slidestr.net/insecure/f:webp/rs:fill:600/plain/${url}`;
  };

  useEffect(() => {
    if (fileEventData.selectedThumbnail == undefined) {
      if (fileEventData.thumbnails && fileEventData.thumbnails?.length > 0) {
        setFileEventData({
          ...fileEventData,
          selectedThumbnail: fileEventData.thumbnails[0],
        });
      }
    }
  }, [fileEventData.thumbnails, fileEventData.selectedThumbnail]);

  return (
    <div className="bg-base-200 rounded-xl p-4 text-neutral-content gap-4 flex flex-row">
      <div>
        <div className="flex gap-4 flex-col">
          {fileEventData.publish.file !== undefined && (
            <div className="form-control flex-row">
              <label className="label cursor-pointer gap-2">
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={fileEventData.publish.file}
                  onChange={e =>
                    setFileEventData({
                      ...fileEventData,
                      publish: { ...fileEventData.publish, file: e.target.checked },
                    })
                  }
                />
                <span className="label-text">Publish file meta data event</span>
              </label>
            </div>
          )}
          {fileEventData.publish.video !== undefined && (
            <div className="form-control flex-row">
              <label className="label cursor-pointer gap-2">
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={fileEventData.publish.video}
                  onChange={e =>
                    setFileEventData({
                      ...fileEventData,
                      publish: { ...fileEventData.publish, video: e.target.checked },
                    })
                  }
                />
                <span className="label-text">Publish video event</span>
              </label>
            </div>
          )}
          {fileEventData.publish.audio !== undefined && (
            <div className="form-control flex-row">
              <label className="label cursor-pointer gap-2">
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={fileEventData.publish.audio}
                  onChange={e =>
                    setFileEventData({
                      ...fileEventData,
                      publish: { ...fileEventData.publish, audio: e.target.checked },
                    })
                  }
                />
                <span className="label-text">Publish audio event</span>
              </label>
            </div>
          )}
        </div>
      </div>
      {fileEventData.m?.startsWith('video/') && (
        <>
          {thumbnailRequestEventId &&
            (fileEventData.thumbnails && fileEventData.thumbnails.length > 0 ? (
              <div className="w-2/6">
                <div className="carousel w-full">
                  {fileEventData.thumbnails.map((t, i) => (
                    <div id={`item${i + 1}`} key={`item${i + 1}`} className="carousel-item w-full">
                      <img width={300} height={300} src={getProxyUrl(t)} className="w-full" />
                    </div>
                  ))}
                </div>
                <div className="flex justify-center w-full py-2 gap-2">
                  {fileEventData.thumbnails.map((t, i) => (
                    <a
                      key={`link${i + 1}`}
                      href={`#item${i + 1}`}
                      onClick={() => setFileEventData({ ...fileEventData, selectedThumbnail: t })}
                      className={'btn btn-xs ' + (t == fileEventData.selectedThumbnail ? 'btn-primary' : '')}
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
      {(isImage || isAudio) && (fileEventData.publishedThumbnail || fileEventData.selectedThumbnail) && (
        <div className="p-4 bg-base-300 w-2/6">
          <img
            width={300}
            height={300}
            src={
              fileEventData.publishedThumbnail
                ? getProxyUrl(fileEventData.publishedThumbnail)
                : fileEventData.selectedThumbnail
            }
            className="w-full"
          />
        </div>
      )}

      <div className="grid gap-4 w-4/6" style={{ gridTemplateColumns: '1fr 30em' }}>
        {(isAudio || isVideo) && (
          <>
            <span className="font-bold">Title</span>
            <input
              type="text"
              className="input input-primary"
              value={fileEventData.title}
              onChange={e => setFileEventData({ ...fileEventData, title: e.target.value })}
            ></input>
          </>
        )}
        {isAudio && (
          <>
            <span className="font-bold">Artist</span>
            <span>{fileEventData.artist}</span>
          </>
        )}
        {isAudio && (
          <>
            <span className="font-bold">Album</span>
            <span>{fileEventData.album}</span>
          </>
        )}
        {isAudio && (
          <>
            <span className="font-bold">Year</span>
            <span>{fileEventData.year}</span>
          </>
        )}

        <span className="font-bold">Summary / Description</span>
        <textarea
          value={fileEventData.content}
          onChange={e => setFileEventData({ ...fileEventData, content: e.target.value })}
          className="textarea textarea-primary"
          placeholder="Caption"
        ></textarea>
        {isAudio && (
          <>
            <span className="font-bold">Genre</span>
            <div>
              <select
                className="select select-bordered select-primary w-full max-w-xs"
                value={fileEventData.genre}
                onChange={e => setFileEventData({ ...fileEventData, genre: e.target.value, subgenre: '' })}
              >
                <option disabled>Select a genre</option>
                {Object.keys(allGenres).map(g => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <select
                className="select select-bordered select-primary w-full max-w-xs mt-2"
                value={fileEventData.subgenre}
                disabled={
                  fileEventData.genre == undefined ||
                  allGenres[fileEventData.genre] == undefined ||
                  allGenres[fileEventData.genre].length == 0
                }
                onChange={e => setFileEventData({ ...fileEventData, subgenre: e.target.value })}
              >
                <option disabled value="">
                  Select a sub genre
                </option>
                {fileEventData.genre &&
                  allGenres[fileEventData.genre] &&
                  allGenres[fileEventData.genre].length > 0 &&
                  allGenres[fileEventData.genre].map(g => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
              </select>
            </div>
          </>
        )}
        <span className="font-bold">Tags</span>
        <TagInput
          tags={fileEventData.tags}
          setTags={(tags: string[]) => setFileEventData({ ...fileEventData, tags })}
        ></TagInput>

        <span className="font-bold">Type</span>
        <span className="flex flex-row gap-2">
          <MimeTypeIcon className="w-6 h-6" type={fileEventData.m} /> {fileEventData.m}
        </span>

        {fileEventData.dim && (
          <>
            <span className="font-bold">Dimensions</span>
            <span>{fileEventData.dim}</span>
          </>
        )}

        <span className="font-bold">File size</span>
        <span>{fileEventData.size ? formatFileSize(fileEventData.size) : 'unknown'}</span>
        <span className="font-bold">URLs</span>
        <div className="flex flex-col gap-2">
          {fileEventData.url.map((url, i) => (
            <div key={i} className="flex flex-row gap-2 items-center">
              <a href={url} className="flex flex-row gap-2 hover:text-primary" target="_blank">
                <ServerIcon className="w-6 h-6" /> {extractDomain(url)}
              </a>
              <a
                onClick={() => copyToClipboard(url)}
                className="btn btn-sm btn-ghost hover:btn-neutral p-1 tooltip"
                data-tip="Copy to clipboard"
              >
                <ClipboardDocumentIcon className="w-6 h-6" />
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FileEventEditor;
