import { useEffect, useState } from 'react';
import { formatFileSize } from '../../utils/utils';
import { fetchId3Tag } from '../../utils/id3';
import useVideoThumbnailDvm from './dvm';
import { usePublishing } from './usePublishing';
import { BlobDescriptor } from 'blossom-client-sdk';
import { transferBlob } from '../../utils/transfer';
import { useNDK } from '../../utils/ndk';
import TagInput from '../TagInput';
import { allGenres } from '../../utils/genres';

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
};

const FileEventEditor = ({ data }: { data: FileEventData }) => {
  const { signEventTemplate } = useNDK();
  const [fileEventData, setFileEventData] = useState(data);
  const [selectedThumbnail, setSelectedThumbnail] = useState<string | undefined>();

  const { createDvmThumbnailRequest, thumbnailRequestEventId } = useVideoThumbnailDvm(setFileEventData);
  const { publishAudioEvent, publishFileEvent, publishVideoEvent } = usePublishing();
  const [jsonOutput, setJsonOutput] = useState('');

  const isAudio = fileEventData.m?.startsWith('audio/');
  const isVideo = fileEventData.m?.startsWith('video/');

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
        });
        setSelectedThumbnail(res.coverFull);
      });
    }
  }, [fileEventData]);

  function extractProtocolAndDomain(url: string): string | null {
    const regex = /^(https?:\/\/[^/]+)/;
    const match = url.match(regex);
    return match ? match[0] : null;
  }

  const publishSelectedThumbnailToAllOwnServers = async (): Promise<BlobDescriptor | undefined> => {
    // TODO investigate why mimetype is not set for reuploaded thumbnail (on mediaserver)
    const servers = fileEventData.url.map(extractProtocolAndDomain);

    // upload selected thumbnail to the same blossom servers as the video
    let uploadedThumbnails: BlobDescriptor[] = [];
    if (selectedThumbnail) {
      uploadedThumbnails = (
        await Promise.all(
          servers.map(s => {
            if (s && selectedThumbnail) return transferBlob(selectedThumbnail, s, signEventTemplate);
          })
        )
      ).filter(t => t !== undefined) as BlobDescriptor[];

      return uploadedThumbnails.length > 0 ? uploadedThumbnails[0] : undefined; // TODO do we need multiple thumbsnails?? or server URLs?
    }
  };

  useEffect(() => {
    if (selectedThumbnail == undefined) {
      if (fileEventData.thumbnails && fileEventData.thumbnails?.length > 0) {
        setSelectedThumbnail(fileEventData.thumbnails[0]);
      }
    }
  }, [fileEventData.thumbnails, selectedThumbnail]);
  // TODO add tags editor
  return (
    <>
      <div className="bg-base-200 rounded-xl p-4 text-neutral-content gap-4 flex flex-row">
        {fileEventData.m?.startsWith('video/') && (
          <>
            {thumbnailRequestEventId &&
              (fileEventData.thumbnails && fileEventData.thumbnails.length > 0 ? (
                <div className="w-2/6">
                  <div className="carousel w-full">
                    {fileEventData.thumbnails.map((t, i) => (
                      <div id={`item${i + 1}`} key={`item${i + 1}`} className="carousel-item w-full">
                        <img
                          width={300}
                          height={300}
                          src={`https://images.slidestr.net/insecure/f:webp/rs:fill:600/plain/${t}`}
                          className="w-full"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-center w-full py-2 gap-2">
                    {fileEventData.thumbnails.map((t, i) => (
                      <a
                        key={`link${i + 1}`}
                        href={`#item${i + 1}`}
                        onClick={() => setSelectedThumbnail(t)}
                        className={'btn btn-xs ' + (t == selectedThumbnail ? 'btn-primary' : '')}
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
        {isAudio && (fileEventData.publishedThumbnail || selectedThumbnail) && (
          <div className="w-2/6">
            <img
              width={300}
              height={300}
              src={
                fileEventData.publishedThumbnail
                  ? `https://images.slidestr.net/insecure/f:webp/rs:fill:600/plain/${fileEventData.publishedThumbnail}`
                  : selectedThumbnail
              }
              className="w-full"
            />
          </div>
        )}

        {fileEventData.m?.startsWith('image/') && (
          <div className="p-4 bg-base-300 w-2/6">
            <img
              width={300}
              height={300}
              src={`https://images.slidestr.net/insecure/f:webp/rs:fill:600/plain/${fileEventData.url[0]}`}
            ></img>
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
                onChange={e => setFileEventData(ed => ({ ...ed, title: e.target.value }))}
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
            onChange={e => setFileEventData(ed => ({ ...ed, content: e.target.value }))}
            className="textarea textarea-primary"
            placeholder="Caption"
          ></textarea>

          <span className="font-bold">Genre</span>
          <div>
            <select
              className="select select-bordered select-primary w-full max-w-xs"
              value={fileEventData.genre}
              onChange={e => setFileEventData(ed => ({ ...ed, genre: e.target.value, subgenre: '' }))}
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
              onChange={e => setFileEventData(ed => ({ ...ed, subgenre: e.target.value }))}
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

          <span className="font-bold">Tags</span>
          <TagInput
            tags={fileEventData.tags}
            setTags={(tags: string[]) => setFileEventData(ed => ({ ...ed, tags }))}
          ></TagInput>

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
            onClick={async () => {
              if (!fileEventData.publishedThumbnail) {
                await publishSelectedThumbnailToAllOwnServers();
              }
              setJsonOutput(await publishFileEvent(fileEventData));
            }}
          >
            Create File Event
          </button>
          <button
            className="btn btn-primary"
            onClick={async () => {
              if (!fileEventData.publishedThumbnail) {
                const selfHostedThumbnail = await publishSelectedThumbnailToAllOwnServers();
                if (selfHostedThumbnail) {
                  const newData: FileEventData = {
                    ...fileEventData,
                    publishedThumbnail: selfHostedThumbnail.url,
                    thumbnails: [selfHostedThumbnail.url],
                  };
                  setFileEventData(newData);
                  setJsonOutput(await publishAudioEvent(newData));
                } else {
                  // self hosting failed
                  console.log('self hosting failed');
                  setJsonOutput(await publishAudioEvent(fileEventData));
                }
              } else {
                // data thumbnail already defined
                console.log('data thumbnail already defined');
                setJsonOutput(await publishAudioEvent(fileEventData));
              }
            }}
          >
            Create Audio Event
          </button>
          <button
            className="btn btn-primary"
            onClick={async () => {
              if (!fileEventData.publishedThumbnail) {
                const selfHostedThumbnail = await publishSelectedThumbnailToAllOwnServers();
                if (selfHostedThumbnail) {
                  const newData: FileEventData = {
                    ...fileEventData,
                    publishedThumbnail: selfHostedThumbnail.url,
                    thumbnails: [selfHostedThumbnail.url],
                  };
                  setFileEventData(newData);
                  setJsonOutput(await publishVideoEvent(newData));
                } else {
                  // self hosting failed
                  console.log('self hosting failed');
                  setJsonOutput(await publishVideoEvent(fileEventData));
                }
              } else {
                // data thumbnail already defined
                console.log('data thumbnail already defined');
                setJsonOutput(await publishVideoEvent(fileEventData));
              }
            }}
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
