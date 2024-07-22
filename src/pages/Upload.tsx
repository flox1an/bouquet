import { useEffect, useState } from 'react';
import { BlobDescriptor, BlossomClient, SignedEvent } from 'blossom-client-sdk';
import { useNDK } from '../utils/ndk';
import { useServerInfo } from '../utils/useServerInfo';
import { useQueryClient } from '@tanstack/react-query';
import { removeExifData } from '../utils/exif';
import axios, { AxiosError, AxiosProgressEvent } from 'axios';
import FileEventEditor, { FileEventData } from '../components/FileEventEditor/FileEventEditor';
import pLimit from 'p-limit';
import { Server, useUserServers } from '../utils/useUserServers';
import { resizeImage } from '../utils/resize';
import { getBlurhashAndSizeFromFile } from '../utils/blur';
import UploadFileSelection, { ResizeOptions, TransferStats } from '../components/UploadFileSelection';
import UploadProgress from '../components/UploadProgress';
import { uploadNip96File } from '../utils/nip96';

function Upload() {
  const servers = useUserServers();
  const { signEventTemplate } = useNDK();
  const { serverInfo } = useServerInfo();
  const queryClient = useQueryClient();
  const [transfers, setTransfers] = useState<{ [key: string]: TransferStats }>({});
  const [files, setFiles] = useState<File[]>([]);
  const [cleanPrivateData, setCleanPrivateData] = useState(true);
  const [uploadBusy, setUploadBusy] = useState(false);
  const limit = pLimit(3);
  const [fileEventsToPublish, setFileEventsToPublish] = useState<FileEventData[]>([]);
  const [imageResize, setImageResize] = useState(0);
  const [uploadStep, setUploadStep] = useState(0);

  async function getListOfFilesToUpload() {
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
    return filesToUpload;
  }

  async function getPreUploadMetaData(filesToUpload: File[]) {
    const fileDimensions: { [key: string]: FileEventData } = {};

    for (const file of filesToUpload) {
      let data = {
        content: file.name.replace(/\.[a-zA-Z0-9]{3,4}$/, ''),
        url: [] as string[],
        originalFile: file,
        tags: [] as string[],
      } as FileEventData;
      if (file.type.startsWith('image/')) {
        const imageInfo = await getBlurhashAndSizeFromFile(file);
        if (imageInfo) {
          const { width, height, blurHash } = imageInfo;
          data = {
            ...data,
            width,
            height,
            dim: `${width}x${height}`,
            blurHash,
          };
        }
      }
      fileDimensions[file.name] = data;
    }
    return fileDimensions;
  }

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
    setUploadStep(1);

    const filesToUpload: File[] = await getListOfFilesToUpload();

    const fileDimensions = await getPreUploadMetaData(filesToUpload);

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

        try {
          let newBlob: BlobDescriptor;
          const progressHandler = (progressEvent: AxiosProgressEvent) => {
            setTransfers(ut => ({
              ...ut,
              [server.name]: {
                ...ut[server.name],
                transferred: serverTransferred + progressEvent.loaded,
                rate: progressEvent.rate || 0,
              },
            }));
          };
          if (server.type == 'blossom') {
            newBlob = await uploadBlob(serverUrl, file, uploadAuth, progressHandler);
          } else {
            newBlob = await uploadNip96File(server, file, '', signEventTemplate, progressHandler);
          }
          console.log('newBlob', newBlob);
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
        } catch (e) {
          const axiosError = e as AxiosError;
          const response = axiosError.response?.data as { message?: string };
          console.error(e);
          // Record error in transfer log
          setTransfers(ut => ({
            ...ut,
            [server.name]: { ...ut[server.name], error: `${axiosError.message} / ${response?.message}` },
          }));
        }
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
            newTransfers[server.name].error = undefined;
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

    //console.log(transfers);
    // TODO transfer can not be accessed yet, errors are not visible here. TODO pout errors somewhere else
    const errorsTransfers = Object.keys(transfers).filter(ts => transfers[ts].enabled && !!transfers[ts].error);
    if (errorsTransfers.length == 0) {
      // Only go to the next step if no errors have occured
      setUploadStep(2);
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
    setUploadStep(0);
  };

  const [transfersInitialized, setTransfersInitialized] = useState(false);

  useEffect(() => {
    if (servers.length > 0 && !transfersInitialized) {
      clearTransfers();
      setTransfersInitialized(true);
    }
  }, [servers, transfersInitialized]);

  return (
    <>
      <ul className="steps p-8">
        <li className={`step ${uploadStep >= 0 ? 'step-primary' : ''}`}>Choose files to upload</li>
        <li className={`step ${uploadStep >= 1 ? 'step-primary' : ''}`}>Upload progress</li>
        <li className={`step ${uploadStep >= 2 ? 'step-primary' : ''}`}>Extend Metadata</li>
        <li className={`step ${uploadStep >= 3 ? 'step-primary' : ''}`}>Publish to NOSTR</li>
      </ul>
      {uploadStep <= 1 && (
        <div className="bg-base-200 rounded-xl p-4 text-neutral-content gap-4 flex flex-col">
          {uploadStep == 0 && (
            <UploadFileSelection
              servers={servers}
              transfers={transfers}
              setTransfers={setTransfers}
              cleanPrivateData={cleanPrivateData}
              setCleanPrivateData={setCleanPrivateData}
              imageResize={imageResize}
              setImageResize={setImageResize}
              files={files}
              setFiles={setFiles}
              clearTransfers={clearTransfers}
              uploadBusy={uploadBusy}
              upload={upload}
            />
          )}

          {uploadStep == 1 && <UploadProgress servers={servers} transfers={transfers} />}
        </div>
      )}
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
