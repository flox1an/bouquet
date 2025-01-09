import { useEffect, useMemo, useState } from 'react';
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
import { extractDomain } from '../utils/utils';
import { transferBlob } from '../utils/transfer';
import { usePublishing } from '../components/FileEventEditor/usePublishing';
import { useNavigate } from 'react-router-dom';
import { NostrEvent } from '@nostr-dev-kit/ndk';
import UploadPublished from '../components/UploadPublished';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import UploadOnboarding from '../components/UploadOboarding';

function Upload() {
  const { servers, serversLoading } = useUserServers();
  const { signEventTemplate } = useNDK();
  const { serverInfo } = useServerInfo();
  const queryClient = useQueryClient();
  const [transfers, setTransfers] = useState<{ [key: string]: TransferStats }>({});
  const [files, setFiles] = useState<File[]>([]);
  const [cleanPrivateData, setCleanPrivateData] = useState(true);
  const [uploadBusy, setUploadBusy] = useState(false);
  const limit = pLimit(3);
  const [preparing, setPreparing] = useState(false);
  const [fileEventsToPublish, setFileEventsToPublish] = useState<FileEventData[]>([]);
  const [imageResize, setImageResize] = useState(0);
  const [uploadStep, setUploadStep] = useState(0);
  const { publishFileEvent, publishAudioEvent, publishVideoEvent } = usePublishing();
  const navigate = useNavigate();

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

  async function createThumbnailForImage(file: File, width: number, height: number) {
    const thumbnailFile = width > 300 || height > 300 ? await resizeImage(file, 300, 300) : undefined;
    return thumbnailFile && URL.createObjectURL(thumbnailFile);
  }

  async function getPreUploadMetaData(filesToUpload: File[]) {
    const fileDimensions: { [key: string]: FileEventData } = {};

    for (const file of filesToUpload) {
      let data = {
        content: file.name.replace(/\.[a-zA-Z0-9]{3,4}$/, ''),
        url: [] as string[],
        originalFile: file,
        tags: [] as string[],
        size: file.size,
        m: file.type,
        publish: {
          file: true,
          audio: file.type.startsWith('audio/') ? true : undefined,
          video: file.type.startsWith('video/') ? true : undefined,
        },
        events: [] as NostrEvent[],
      } as FileEventData;
      if (file.type.startsWith('image/')) {
        const imageInfo = await getBlurhashAndSizeFromFile(file);
        if (imageInfo) {
          const { width, height, blurHash } = imageInfo;
          const thumbnailBlobUrl = await createThumbnailForImage(file, width, height);
          data = {
            ...data,
            width,
            height,
            dim: `${width}x${height}`,
            blurHash,
            thumbnails: thumbnailBlobUrl ? [thumbnailBlobUrl] : [],
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
    setPreparing(true);

    setUploadStep(1);
    // TODO this blocks the UI
    const filesToUpload: File[] = await getListOfFilesToUpload();
    const fileDimensions = await getPreUploadMetaData(filesToUpload);
    setPreparing(false);

    // TODO icon to cancel upload
    // TODO detect if the file already exists? if we have the hash??

    const startTransfer = async (server: Server, primary: boolean) => {
      const serverUrl = serverInfo[server.name].url;
      let serverTransferred = 0;
      for (const file of filesToUpload) {
        const authStartTime = Date.now();
        // TODO do this only once for each file. Currently this is called for every server
        const uploadAuth = await BlossomClient.createUploadAuth(signEventTemplate, file, 'Upload Blob');
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
            size: newBlob.size || fileDimensions[file.name].size, // fallback for nip96 servers that don't return size
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
    // setter for error transfers has not executed when we reach here.
    const errorsTransfers = Object.keys(transfers).filter(ts => transfers[ts].enabled && !!transfers[ts].error);
    console.log('errorCheck', errorsTransfers);
    if (errorsTransfers.length == 0) {
      // Only go to the next step if no errors have occured
      // TODO why dont we detect errors here?????? INVESTIGATE
      // Should show button to "skip" despite of errors
      setUploadStep(2);
    }
  };

  const clearTransfers = () => {
    setTransfers(tfs =>
      servers.reduce(
        (acc, s, i) => ({
          ...acc,
          [s.name]: {
            enabled: !serverInfo[s.name].isError && (tfs[s.name] !== undefined ? tfs[s.name].enabled : i < 2), // select first two servers by default.
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

  const publishSelectedThumbnailToAllOwnServers = async (
    fileEventData: FileEventData
  ): Promise<BlobDescriptor | undefined> => {
    // TODO investigate why mimetype is not set for reuploaded thumbnail (on mediaserver)
    const servers = fileEventData.url.map(u => extractDomain(u));

    // upload selected thumbnail to the same blossom servers as the video
    let uploadedThumbnails: BlobDescriptor[] = [];
    if (fileEventData.selectedThumbnail) {
      uploadedThumbnails = (
        await Promise.all(
          servers.map(s => {
            if (s && fileEventData.selectedThumbnail) {
              console.log(s);
              console.log(serverInfo);
              return transferBlob(fileEventData.selectedThumbnail, serverInfo[s], signEventTemplate);
            }
          })
        )
      ).filter(t => t !== undefined) as BlobDescriptor[];

      return uploadedThumbnails.length > 0 ? uploadedThumbnails[0] : undefined; // TODO do we need multiple thumbsnails?? or server URLs?
    }
  };

  const publishAll = async () => {
    //const publishedEvents: FileEventData[] = [];
    fileEventsToPublish.forEach(async fe => {
      if (fe.publish.file) {
        if (!fe.publishedThumbnail) {
          const selfHostedThumbnail = await publishSelectedThumbnailToAllOwnServers(fe);
          if (selfHostedThumbnail) {
            const newData: FileEventData = {
              ...fe,
              publishedThumbnail: selfHostedThumbnail.url,
              thumbnails: [selfHostedThumbnail.url],
            };
            const publishedEvent = await publishFileEvent(newData);
            setFileEventsToPublish(prev =>
              prev.map(f => (f.x === fe.x ? { ...f, events: [...f.events, publishedEvent] } : f))
            );
          } else {
            // self hosting failed
            console.log('self hosting failed');
            const publishedEvent = await publishFileEvent(fe);
            setFileEventsToPublish(prev =>
              prev.map(f => (f.x === fe.x ? { ...f, events: [...f.events, publishedEvent] } : f))
            );
          }
        } else {
          // data thumbnail already defined
          console.log('data thumbnail already defined');
          const publishedEvent = await publishFileEvent(fe);
          setFileEventsToPublish(prev =>
            prev.map(f => (f.x === fe.x ? { ...f, events: [...f.events, publishedEvent] } : f))
          );
        }
      }
      if (fe.publish.audio) {
        if (!fe.publishedThumbnail) {
          const selfHostedThumbnail = await publishSelectedThumbnailToAllOwnServers(fe);
          if (selfHostedThumbnail) {
            const newData: FileEventData = {
              ...fe,
              publishedThumbnail: selfHostedThumbnail.url,
              thumbnails: [selfHostedThumbnail.url],
            };
            const publishedEvent = await publishAudioEvent(newData);
            setFileEventsToPublish(prev =>
              prev.map(f => (f.x === fe.x ? { ...f, events: [...f.events, publishedEvent] } : f))
            );
          } else {
            // self hosting failed
            console.log('self hosting failed');
            const publishedEvent = await publishAudioEvent(fe);
            setFileEventsToPublish(prev =>
              prev.map(f => (f.x === fe.x ? { ...f, events: [...f.events, publishedEvent] } : f))
            );
          }
        } else {
          // data thumbnail already defined
          console.log('data thumbnail already defined');
          const publishedEvent = await publishAudioEvent(fe);
          setFileEventsToPublish(prev =>
            prev.map(f => (f.x === fe.x ? { ...f, events: [...f.events, publishedEvent] } : f))
          );
        }
      }
      if (fe.publish.video) {
        if (!fe.publishedThumbnail) {
          const selfHostedThumbnail = await publishSelectedThumbnailToAllOwnServers(fe);
          if (selfHostedThumbnail) {
            const newData: Partial<FileEventData> = {
              publishedThumbnail: selfHostedThumbnail.url,
              thumbnails: [selfHostedThumbnail.url],
            };
            const publishedEvent = await publishVideoEvent({ ...fe, ...newData });
            setFileEventsToPublish(prev =>
              prev.map(f =>
                f.x === fe.x
                  ? {
                      ...f,
                      ...newData,
                      events: [...f.events, publishedEvent],
                    }
                  : f
              )
            );
          } else {
            // self hosting failed
            console.log('self hosting failed');
            const publishedEvent = await publishVideoEvent(fe);
            setFileEventsToPublish(prev =>
              prev.map(f => (f.x === fe.x ? { ...f, events: [...f.events, publishedEvent] } : f))
            );
          }
        } else {
          // data thumbnail already defined
          console.log('data thumbnail already defined');
          const publishedEvent = await publishVideoEvent(fe);
          setFileEventsToPublish(prev =>
            prev.map(f => (f.x === fe.x ? { ...f, events: [...f.events, publishedEvent] } : f))
          );
        }
      }
    });
    setUploadStep(3);
  };

  const audioCount = useMemo(() => fileEventsToPublish.filter(fe => fe.publish.audio).length, [fileEventsToPublish]);

  const publishCount = useMemo(() => {
    const fileCount = fileEventsToPublish.filter(fe => fe.publish.file).length;
    const videoCount = fileEventsToPublish.filter(fe => fe.publish.video).length;
    return fileCount + audioCount + videoCount;
  }, [fileEventsToPublish, audioCount]);

  return (
    <div className="flex flex-col mx-auto max-w-[80em] w-full">
      {!serversLoading && (!servers || servers.length == 0) ? (
        <UploadOnboarding />
      ) : (
        <>
          <ul className="steps pt-8 pb-4 md:p-8">
            <li className={`step ${uploadStep >= 0 ? 'step-primary' : ''}`}>Choose files</li>
            <li className={`step ${uploadStep >= 1 ? 'step-primary' : ''}`}>Upload</li>
            <li className={`step ${uploadStep >= 2 ? 'step-primary' : ''}`}>Add metadata</li>
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

              {uploadStep == 1 && <UploadProgress servers={servers} transfers={transfers} preparing={preparing} />}
            </div>
          )}
          {uploadStep == 2 && fileEventsToPublish.length > 0 && (
            <div className="gap-4 flex flex-col">
              <h2 className="">Publish events</h2>
              <div className="flex flex-col gap-4">
                {fileEventsToPublish.map(fe => (
                  <FileEventEditor
                    key={fe.x}
                    fileEventData={fe}
                    setFileEventData={updatedFe =>
                      setFileEventsToPublish(prev => prev.map(f => (f.x === fe.x ? updatedFe : f)) as FileEventData[])
                    }
                  />
                ))}
              </div>
              {audioCount > 0 && (
                <div className="text-sm text-neutral-content flex flex-row gap-2 items-center pl-4">
                  <InformationCircleIcon className="w-6 h-6 text-info" />
                  Audio events are not widely supported yet. Currently they are only used by{' '}
                  <a className="link link-primary" href="https://stemstr.app/" target="_blank">
                    stemstr.app
                  </a>
                </div>
              )}
              <div className="bg-base-200 rounded-xl p-4 text-neutral-content gap-4 flex flex-row justify-center">
                <button
                  className={`btn ${publishCount === 0 ? 'btn-primary' : 'btn-neutral'} w-40`}
                  onClick={() => {
                    navigate('/browse');
                  }}
                >
                  Skip publishing
                </button>
                {publishCount > 0 && (
                  <button className="btn btn-primary w-40" onClick={() => publishAll()}>
                    Publish ({publishCount} event{publishCount > 1 ? 's' : ''})
                  </button>
                )}
              </div>
            </div>
          )}
          {uploadStep == 3 && <UploadPublished fileEventsToPublish={fileEventsToPublish} />}
        </>
      )}
    </div>
  );
}

export default Upload;
