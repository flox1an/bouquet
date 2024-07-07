import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { BlobDescriptor, BlossomClient, SignedEvent } from 'blossom-client-sdk';
import { useNDK } from '../utils/ndk';
import { useServerInfo } from '../utils/useServerInfo';
import { useQueryClient } from '@tanstack/react-query';
import { removeExifData } from '../utils/exif';
import axios, { AxiosProgressEvent } from 'axios';
import { ArrowUpOnSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import CheckBox from '../components/CheckBox/CheckBox';
import ProgressBar from '../components/ProgressBar/ProgressBar';
import { formatFileSize } from '../utils/utils';
import FileEventEditor, { FileEventData } from '../components/FileEventEditor/FileEventEditor';
import pLimit from 'p-limit';
import { Server, useUserServers } from '../utils/useUserServers';
import { resizeImage } from '../utils/resize';
import { getImageSize } from '../utils/image';
import { getBlurhashFromFile } from '../utils/blur';

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

type ResizeOptionType = {
  name: string;
  format?: string;
  width?: number;
  height?: number;
};

const ResizeOptions: ResizeOptionType[] = [
  {
    name: 'Orignal Image',
    width: undefined,
    height: undefined,
  },
  {
    name: 'max. 2048x2048 pixels',
    width: 2048,
    height: 2048,
  },
  {
    name: 'max. 1080x1080 pixels',
    width: 1080,
    height: 1080,
  },
];

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
  // const bs = useBlossomServerEvents();
  // console.log(bs);

  const [fileEventsToPublish, setFileEventsToPublish] = useState<FileEventData[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [imageResize, setImageResize] = useState(0);

  // const [resizeImages, setResizeImages] = useState(false);
  // const [publishToNostr, setPublishToNostr] = useState(false);

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
    setUploadBusy(true);

    const filesToUpload: File[] = [];
    for (const f of files) {
      let processedFile = f;

      if (processedFile.type.startsWith('image/')) {
        // Do image processing according to options
        if (imageResize > 0) {
          const { width, height } = ResizeOptions[imageResize];
          processedFile = await resizeImage(processedFile, width, height);
        }
        if (cleanPrivateData) {
          processedFile = await removeExifData(processedFile);
        }
      }

      filesToUpload.push(processedFile);
    }

    const fileDimensions: { [key: string]: FileEventData } = {};
    for (const file of filesToUpload) {
      let data = {
        content: file.name.replace(/\.[a-zA-Z0-9]{3,4}$/, ''),
        url: [] as string[],
        originalFile: file,
      } as FileEventData;
      if (file.type.startsWith('image/')) {
        const dimensions = await getImageSize(file);
        data = {
          ...data,
          width: dimensions.width,
          height: dimensions.height,
          dim: `${dimensions.width}x${dimensions.height}`,
        };

        // TODO maybe combine fileSize and Hash!
        const blur = await getBlurhashFromFile(file);
        if (blur) {
          data = {
            ...data,
            blurHash: blur,
          };
        }
      }
      fileDimensions[file.name] = data;
    }

    // TODO icon to cancel upload
    // TODO detect if the file already exists? if we have the hash??

    const startTransfer = async (server: Server, primary: boolean) => {
      const serverUrl = serverInfo[server.name].url;
      let serverTransferred = 0;
      for (const file of filesToUpload) {
        const authStartTime = Date.now();
        // TODO do this only once for each file. Currently this is called for every server
        const uploadAuth = await BlossomClient.getUploadAuth(file, signEventTemplate, 'Upload Blob');
        console.log(`Created auth event in ${Date.now() - authStartTime} ms`, uploadAuth);

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

    setUploadBusy(false);
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
  }, [servers]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (uploadBusy) return;

    const selectedFiles = event.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      const newFiles = Array.from(selectedFiles);
      setFiles(prevFiles => [...prevFiles, ...newFiles]);
      clearTransfers();
    }
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    if (uploadBusy) return;
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

      {/*
      <button
        className="btn btn-primary"
        onClick={async () => {
          const url =
            'https://media-server.slidestr.net/3c3f3f0b67c17953e59ebdb53b7fd83bf68b552823b927fa9718a52e12d53c0a';
          const targetServer = 'https://test-store.slidestr.net';

          const headers = {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          };

          const blossomClient = new BlossomClient(targetServer, signEventTemplate);
          const mirrorAuth = await blossomClient.getMirrorAuth(
            '3c3f3f0b67c17953e59ebdb53b7fd83bf68b552823b927fa9718a52e12d53c0a',
            'Upload Blob'
          );

          const res = await axios.put<BlobDescriptor>(
            `${targetServer}/mirror`,
            { url },
            {
              headers: mirrorAuth
                ? { ...headers, authorization: BlossomClient.encodeAuthorizationHeader(mirrorAuth) }
                : headers,
            }
          );

          console.log(res.status);
          console.log(res.data);
        }}
      >
        Test Mirror
      </button>
      */}

      <div className=" bg-base-200 rounded-xl p-4 text-neutral-content gap-4 flex flex-col">
        <input
          id="browse"
          type="file"
          ref={fileInputRef}
          disabled={uploadBusy}
          hidden
          multiple
          onChange={handleFileChange}
        />
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
                disabled={uploadBusy}
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
        <h3 className="text-lg text-neutral-content">Image Options</h3>
        <div className="cursor-pointer grid gap-2 items-center" style={{ gridTemplateColumns: '1.5em auto' }}>
          <CheckBox
            name="cleanData"
            disabled={uploadBusy}
            checked={cleanPrivateData}
            setChecked={c => setCleanPrivateData(c)}
            label="Clean private data in images (EXIF)"
          ></CheckBox>
          <input
            className="checkbox checkbox-primary "
            id="resizeOption"
            disabled={uploadBusy}
            type="checkbox"
            checked={imageResize > 0}
            onChange={() => setImageResize(irs => (irs > 0 ? 0 : 1))}
          />
          <div>
            <label htmlFor="resizeOption" className="cursor-pointer select-none">
              Resize Image
            </label>
            <select
              disabled={uploadBusy || imageResize == 0}
              className="select select-bordered select-sm ml-4 w-full max-w-xs"
              onChange={e => setImageResize(e.target.selectedIndex)}
              value={imageResize}
            >
              {ResizeOptions.map((ro, i) => (
                <option key={ro.name} disabled={i == 0}>
                  {ro.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-row gap-2">
          <button className="btn btn-primary" onClick={() => upload()} disabled={uploadBusy || files.length == 0}>
            Upload{files.length > 0 ? (files.length == 1 ? ` 1 file` : ` ${files.length} files`) : ''} /{' '}
            {formatFileSize(sizeOfFilesToUpload)}
          </button>
          <button
            className="btn  btn-secondary  "
            disabled={uploadBusy || files.length == 0}
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
            <FileEventEditor key={fe.x} data={fe} />
          ))}
        </>
      )}
    </>
  );
}

export default Upload;
