import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { BlobDescriptor, BlossomClient, SignedEvent } from 'blossom-client-sdk';
import { useNDK } from '../ndk';
import { useServerInfo } from '../utils/useServerInfo';
import { useQueryClient } from '@tanstack/react-query';
import { removeExifData } from '../exif';
import axios, { AxiosProgressEvent } from 'axios';
import { ArrowUpOnSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import CheckBox from '../components/CheckBox/CheckBox';
import ProgressBar from '../components/ProgressBar/ProgressBar';
import { formatFileSize } from '../utils';
import FileEventEditor, { FileEventData } from '../components/FileEventEditor/FileEventEditor';
import pLimit from 'p-limit';
import { Server, useUserServers } from '../utils/useUserServers';
import useBlossomServerEvents from '../utils/useBlossomServerEvents';

type TransferStats = {
  enabled: boolean;
  size: number;
  transferred: number;
  rate: number;
};

/*
TODO
steps
- select files
- (preview/reisze/exif removal)
  - images: size, blurimage, dimensions
  - audio: id3 tag
  - video: dimensions, bitrate
- upload
  - server slection, progress bars, upload speed
- 
*/

function Upload() {
  const servers = useUserServers();
  const { signEventTemplate } = useNDK();
  const { serverInfo } = useServerInfo();
  const queryClient = useQueryClient();
  const [transfers, setTransfers] = useState<{ [key: string]: TransferStats }>({});
  const [files, setFiles] = useState<File[]>([]);
  const [cleanPrivateData, setCleanPrivateData] = useState(true);
  const limit = pLimit(3);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bs = useBlossomServerEvents();
  const [fileEventsToPublish, setFileEventsToPublish] = useState<FileEventData[]>([]);
console.log(bs);
  // const [resizeImages, setResizeImages] = useState(false);
  // const [publishToNostr, setPublishToNostr] = useState(false);

  type ImageSize = {
    width: number;
    height: number;
  };

  const getImageSize = async (imageFile: File): Promise<ImageSize> => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(imageFile);
    const promise = new Promise<ImageSize>((resolve, reject) => {
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
        URL.revokeObjectURL(objectUrl);
      };
      img.onerror = () => reject();
    });
    img.src = objectUrl;
    return promise;
  };

  async function uploadBlob(
    server: string,
    file: File,
    auth?: SignedEvent,
    onUploadProgress?: (progressEvent: AxiosProgressEvent) => void
  ) {
    const headers = {
      Accept: 'application/json',
      'Content-Type': file.type,
    };

    const res = await axios.put<BlobDescriptor>(`${server}/upload`, file, {
      headers: auth ? { ...headers, authorization: BlossomClient.encodeAuthorizationHeader(auth) } : headers,
      onUploadProgress,
    });

    return res.data;
  }

  const upload = async () => {
    const filesToUpload: File[] = [];
    for (const f of files) {
      if (cleanPrivateData) {
        filesToUpload.push(await removeExifData(f));
      } else {
        filesToUpload.push(f);
      }
    }

    // TODO use https://github.com/davejm/client-compress
    // for image resizing
    const fileDimensions: { [key: string]: FileEventData } = {};
    for (const file of filesToUpload) {
      let data = { content: file.name, url: [] as string[] } as FileEventData;
      if (file.type.startsWith('image/')) {
        const dimensions = await getImageSize(file);
        data = { ...data, dim: `${dimensions.width}x${dimensions.height}` };
      }
      fileDimensions[file.name] = data;
    }

    const startTransfer = async (server: Server, primary: boolean) => {
      const serverUrl = serverInfo[server.name].url;
      let serverTransferred = 0;
      for (const file of filesToUpload) {
        const uploadAuth = await BlossomClient.getUploadAuth(file, signEventTemplate, 'Upload Blob');

        const newBlob = await uploadBlob(serverUrl, file, uploadAuth, progressEvent => {
          setTransfers(ut => ({
            ...ut,
            [server.name]: {
              ...ut[server.name],
              transferred: serverTransferred + progressEvent.loaded,
              rate: progressEvent.rate || 0,
            },
          }));
        });

        serverTransferred += file.size;
        setTransfers(ut => ({
          ...ut,
          [server.name]: { ...ut[server.name], transferred: serverTransferred, rate: 0 },
        }));

        fileDimensions[file.name] = {
          ...fileDimensions[file.name],
          x: newBlob.sha256,
          url: primary
            ? [newBlob.url, ...fileDimensions[file.name].url]
            : [...fileDimensions[file.name].url, newBlob.url],
          size: newBlob.size,
          m: newBlob.type,
        };
      }
      queryClient.invalidateQueries({ queryKey: ['blobs', server.name] });
    };

    if (filesToUpload && filesToUpload.length) {
      // sum files sizes
      const totalSize = filesToUpload.reduce((acc, f) => acc + f.size, 0);

      // set all entries size to totalSize
      setTransfers(ut => {
        const newTransfers = { ...ut };
        for (const server of servers) {
          if (newTransfers[server.name].enabled) {
            newTransfers[server.name].size = totalSize;
          }
        }
        return newTransfers;
      });

      const enabledServers = servers.filter(s => transfers[s.name]?.enabled);
      const primaryServerName = servers[0].name;

      await Promise.all(enabledServers.map(s => limit(() => startTransfer(s, s.name == primaryServerName))));

      setFiles([]);
      // TODO reset input control value??
      setFileEventsToPublish(Object.values(fileDimensions));
    }
  };

  const clearTransfers = () => {
    setTransfers(tfs =>
      servers.reduce(
        (acc, s) => ({
          ...acc,
          [s.name]: {
            enabled: !serverInfo[s.name].isError && (tfs[s.name] !== undefined ? tfs[s.name].enabled : true),
            size: 0,
            transferred: 0,
          },
        }),
        {}
      )
    );
    setFileEventsToPublish([]);
  };

  useEffect(() => {
    clearTransfers();
    /*
    setFileEventsToPublish([
      {
        content: '_DSF3852.jpg',
        dim: '1365x2048',
        m: 'image/jpeg',
        size: 599988,
        url: [
          'https://test-store.slidestr.net/d32b7eff53919bc38b59e05b2fe4bda3067c46589eeee743a46649ae71f4b659',

          'https://media-server.slidestr.net/d32b7eff53919bc38b59e05b2fe4bda3067c46589eeee743a46649ae71f4b659',

          'https://cdn.satellite.earth/d32b7eff53919bc38b59e05b2fe4bda3067c46589eeee743a46649ae71f4b659.jpg',
        ],
        x: 'd32b7eff53919bc38b59e05b2fe4bda3067c46589eeee743a46649ae71f4b659',
      },
    ]);*/
  }, [servers]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      const newFiles = Array.from(selectedFiles);
      setFiles(prevFiles => [...prevFiles, ...newFiles]);
      clearTransfers();
    }
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const droppedFiles = event.dataTransfer?.files;
    if (droppedFiles && droppedFiles.length > 0) {
      const newFiles = Array.from(droppedFiles);
      setFiles(prevFiles => [...prevFiles, ...newFiles]);
      clearTransfers();
    }
  };

  const sizeOfFilesToUpload = useMemo(() => files.reduce((acc, file) => (acc += file.size), 0), [files]);
  return (
    <>
      <h2 className=" py-4">Upload</h2>
      <div className=" bg-base-200 rounded-xl p-4 text-neutral-content gap-4 flex flex-col">
        <input id="browse" type="file" ref={fileInputRef} hidden multiple onChange={handleFileChange} />
        <label
          htmlFor="browse"
          className="p-8 bg-base-100 rounded-lg hover:text-primary text-neutral-content border-dashed  border-neutral-content border-opacity-50 border-2 block cursor-pointer text-center"
          onDrop={handleDrop}
          onDragOver={event => event.preventDefault()}
        >
          <ArrowUpOnSquareIcon className="w-8 inline" /> Browse or drag & drop
        </label>
        <h3 className="text-lg">Servers</h3>
        <div className="cursor-pointer grid gap-2" style={{ gridTemplateColumns: '1.5em 20em auto' }}>
          {servers.map(s => (
            <>
              <CheckBox
                name={s.name}
                checked={transfers[s.name]?.enabled || false}
                setChecked={c =>
                  setTransfers(ut => ({ ...ut, [s.name]: { enabled: c, transferred: 0, size: 0, rate: 0 } }))
                }
                label={s.name}
              ></CheckBox>
              {transfers[s.name]?.enabled ? (
                <ProgressBar
                  value={transfers[s.name].transferred}
                  max={transfers[s.name].size}
                  description={transfers[s.name].rate > 0 ? '' + formatFileSize(transfers[s.name].rate) + '/s' : ''}
                />
              ) : (
                <div></div>
              )}
            </>
          ))}
        </div>
        <h3 className="text-lg text-neutral-content">Options</h3>
        <div className="cursor-pointer grid gap-2" style={{ gridTemplateColumns: '1.5em auto' }}>
          <CheckBox
            name="cleanData"
            checked={cleanPrivateData}
            setChecked={c => setCleanPrivateData(c)}
            label="Clean private data in images (EXIF)"
          ></CheckBox>
          {/* 
          <CheckBox
            name="resize"
            checked={resizeImages}
            setChecked={c => setResizeImages(c)}
            label="Resize images to max. 2048 x 2048 (NOT IMPLEMENTED YET!)"
          ></CheckBox>
          <CheckBox
            name="publish"
            checked={publishToNostr}
            setChecked={c => setPublishToNostr(c)}
            label="Publish to NOSTR (as 1063 file metadata event) (NOT IMPLEMENTED YET!)"
          ></CheckBox>
          */}
        </div>
        <div className="flex flex-row gap-2">
          <button className="btn btn-primary" onClick={() => upload()} disabled={files.length == 0}>
            Upload{files.length > 0 ? (files.length == 1 ? ` 1 file` : ` ${files.length} files`) : ''} /{' '}
            {formatFileSize(sizeOfFilesToUpload)}
          </button>
          <button
            className="btn  btn-secondary  "
            disabled={files.length == 0}
            onClick={() => {
              clearTransfers();
              setFiles([]);
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
            }}
          >
            <TrashIcon className="w-6" />
          </button>
        </div>
      </div>
      {fileEventsToPublish.length > 0 && (
        <>
          <h2 className="py-4">Publish events</h2>
          {fileEventsToPublish.map(fe => (
            <FileEventEditor data={fe} />
          ))}
        </>
      )}
    </>
  );
}

export default Upload;
