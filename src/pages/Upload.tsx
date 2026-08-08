import { useCallback, useEffect, useMemo, useState } from 'react';
import { BlobDescriptor } from 'blossom-client-sdk';
import { createUploadAuth } from 'blossom-client-sdk/auth';
import { useNostr } from '../utils/nostr';
import { useServerInfo } from '../utils/useServerInfo';
import { useQueryClient } from '@tanstack/react-query';
import { removeExifData } from '../utils/exif';
import type { AxiosError, AxiosProgressEvent } from 'axios';
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
import { calculateFileHash, checkBlobExists } from '../utils/blossom';
import { formatUploadError, uploadBlob } from '../utils/upload';
import { usePublishing } from '../components/FileEventEditor/usePublishing';
import { useNavigate, useLocation } from 'react-router-dom';
import type { NostrEvent } from 'nostr-tools';
import { Button } from '@/components/ui/button';
import { Steps } from '@/components/ui/steps';
import UploadPublished from '../components/UploadPublished';
import { Info } from 'lucide-react';
import UploadOnboarding from '../components/UploadOboarding';
import { toast } from '@/hooks/use-toast';
import { getCatalog } from '../catalog/catalog';

function Upload() {
  const { servers, serversLoading } = useUserServers();
  const { user, signEventTemplate } = useNostr();
  const { serverInfo } = useServerInfo();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [transfers, setTransfers] = useState<{ [key: string]: TransferStats }>({});
  const [files, setFiles] = useState<File[]>([]);
  const [cleanPrivateData, setCleanPrivateData] = useState(true);
  const [uploadBusy, setUploadBusy] = useState(false);
  const limit = pLimit(3);
  const [preparing, setPreparing] = useState(false);
  const [fileEventsToPublish, setFileEventsToPublish] = useState<(FileEventData & { publishErrors?: string[] })[]>([]);
  const [imageResize, setImageResize] = useState(0);
  const [uploadStep, setUploadStep] = useState(0);
  const { publishFileEvent, publishAudioEvent, publishVideoEvent } = usePublishing();
  const navigate = useNavigate();

  // Get pre-selected server from navigation state
  const preSelectedServer = (location.state as { preSelectedServer?: Server })?.preSelectedServer;

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

  const upload = async () => {
    setUploadBusy(true);
    setPreparing(true);
    const failedServers = new Set<string>();

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
        try {
          let newBlob: BlobDescriptor;

          // Check if blob already exists on Blossom servers
          if (server.type == 'blossom') {
            const fileHash = await calculateFileHash(file);

            // Check if blob exists using HEAD request
            const existingBlob = await checkBlobExists(serverUrl, fileHash);

            if (existingBlob) {
              newBlob = existingBlob;
              // Mark as transferred immediately since we're skipping upload
              serverTransferred += file.size;
              setTransfers(ut => ({
                ...ut,
                [server.name]: { ...ut[server.name], transferred: serverTransferred, rate: 0 },
              }));
            } else {
              // Blob doesn't exist, proceed with upload
              const uploadAuth = await createUploadAuth(signEventTemplate, file);

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

              newBlob = await uploadBlob(serverUrl, file, uploadAuth, progressHandler);
              serverTransferred += file.size;
              setTransfers(ut => ({
                ...ut,
                [server.name]: { ...ut[server.name], transferred: serverTransferred, rate: 0 },
              }));
            }
          } else {
            // NIP-96 servers - upload as normal (no HEAD check yet)
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
            newBlob = await uploadNip96File(server, file, '', signEventTemplate, progressHandler);
            serverTransferred += file.size;
            setTransfers(ut => ({
              ...ut,
              [server.name]: { ...ut[server.name], transferred: serverTransferred, rate: 0 },
            }));
          }

          fileDimensions[file.name] = {
            ...fileDimensions[file.name],
            x: newBlob.sha256,
            url: primary
              ? [newBlob.url, ...fileDimensions[file.name].url]
              : [...fileDimensions[file.name].url, newBlob.url],
            size: newBlob.size || fileDimensions[file.name].size, // fallback for nip96 servers that don't return size
            m: newBlob.type,
          };
          if (user?.pubkey) {
            void getCatalog()
              .ingestUpload(user.pubkey, { url: server.url, type: server.type }, newBlob)
              .catch(() => undefined);
          }
        } catch (e) {
          const axiosError = e as AxiosError;
          console.error(e);
          failedServers.add(server.name);
          // Record error in transfer log
          setTransfers(ut => ({
            ...ut,
            [server.name]: { ...ut[server.name], error: formatUploadError(axiosError) },
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

    if (failedServers.size === 0) {
      // Only go to the next step if no errors have occured
      setUploadStep(2);
    } else {
      toast({
        variant: 'destructive',
        title: 'Upload completed with errors',
        description: `Some uploads failed on ${failedServers.size} server(s). Check the transfer status below.`,
      });
    }
  };

  const clearTransfers = useCallback(() => {
    setTransfers(tfs =>
      servers.reduce(
        (acc, s, i) => ({
          ...acc,
          [s.name]: {
            enabled:
              !serverInfo[s.name].isError &&
              (tfs[s.name] !== undefined
                ? tfs[s.name].enabled
                : preSelectedServer
                  ? s.name === preSelectedServer.name
                  : i < 2), // select pre-selected server or first two servers by default
            size: 0,
            transferred: 0,
          },
        }),
        {}
      )
    );

    setFileEventsToPublish([]);
    setUploadStep(0);
  }, [servers, serverInfo, preSelectedServer]);

  const [transfersInitialized, setTransfersInitialized] = useState(false);

  useEffect(() => {
    if (servers.length > 0 && !transfersInitialized) {
      clearTransfers();
      setTransfersInitialized(true);
    }
  }, [servers, transfersInitialized, clearTransfers]);

  const publishSelectedThumbnailToAllOwnServers = async (
    fileEventData: FileEventData
  ): Promise<BlobDescriptor | undefined> => {
    // TODO investigate why mimetype is not set for reuploaded thumbnail (on mediaserver)
    const servers = fileEventData.url.map(u => extractDomain(u));

    // upload selected thumbnail to the same blossom servers as the video
    if (fileEventData.selectedThumbnail) {
      const uploadedThumbnails = (
        await Promise.all(
          servers.map(s => {
            if (s && fileEventData.selectedThumbnail) {
              return transferBlob(fileEventData.selectedThumbnail, serverInfo[s], signEventTemplate, {
                onCompleted: (blob, method) => {
                  if (!user?.pubkey) return;
                  return getCatalog()
                    .ingestUpload(
                      user.pubkey,
                      { url: serverInfo[s].url, type: serverInfo[s].type },
                      blob,
                      method === 'mirror'
                    )
                    .catch(() => undefined);
                },
              });
            }
          })
        )
      ).filter(t => t !== undefined) as BlobDescriptor[];

      return uploadedThumbnails.length > 0 ? uploadedThumbnails[0] : undefined; // TODO do we need multiple thumbsnails?? or server URLs?
    }
  };

  const publishOne = async (
    fe: FileEventData,
    publishFn: (data: FileEventData) => Promise<NostrEvent>,
    persistThumbnailToState: boolean
  ) => {
    let dataToPublish: FileEventData = fe;
    let statePatch: Partial<FileEventData> = {};

    if (!fe.publishedThumbnail) {
      const selfHosted = await publishSelectedThumbnailToAllOwnServers(fe);
      if (selfHosted) {
        const patch = { publishedThumbnail: selfHosted.url, thumbnails: [selfHosted.url] };
        dataToPublish = { ...fe, ...patch };
        if (persistThumbnailToState) statePatch = patch;
      }
    }

    const publishedEvent = await publishFn(dataToPublish);
    setFileEventsToPublish(prev =>
      prev.map(f => (f.x === fe.x ? { ...f, ...statePatch, events: [...f.events, publishedEvent] } : f))
    );
  };

  const publishAll = async () => {
    setUploadBusy(true);

    const publishJobs = fileEventsToPublish.flatMap(fe => [
      ...(fe.publish.file ? [{ fe, label: 'File event', publish: () => publishOne(fe, publishFileEvent, false) }] : []),
      ...(fe.publish.audio
        ? [{ fe, label: 'Audio event', publish: () => publishOne(fe, publishAudioEvent, false) }]
        : []),
      ...(fe.publish.video
        ? [{ fe, label: 'Video event', publish: () => publishOne(fe, publishVideoEvent, true) }]
        : []),
    ]);

    try {
      const results = await Promise.allSettled(publishJobs.map(job => job.publish()));
      const errorsByFile = new Map<string, string[]>();

      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const { fe, label } = publishJobs[index];
          const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
          errorsByFile.set(fe.x, [...(errorsByFile.get(fe.x) ?? []), `${label}: ${message}`]);
        }
      });

      if (errorsByFile.size > 0) {
        setFileEventsToPublish(prev =>
          prev.map(fe => (errorsByFile.has(fe.x) ? { ...fe, publishErrors: errorsByFile.get(fe.x) } : fe))
        );
      }

      setUploadStep(3);
    } finally {
      setUploadBusy(false);
    }
  };

  const audioCount = useMemo(() => fileEventsToPublish.filter(fe => fe.publish.audio).length, [fileEventsToPublish]);

  const publishCount = useMemo(() => {
    const fileCount = fileEventsToPublish.filter(fe => fe.publish.file).length;
    const videoCount = fileEventsToPublish.filter(fe => fe.publish.video).length;
    return fileCount + audioCount + videoCount;
  }, [fileEventsToPublish, audioCount]);

  return (
    <div className="mx-auto flex w-full max-w-[80em] flex-col gap-4 py-1">
      {!serversLoading && (!servers || servers.length == 0) ? (
        <UploadOnboarding />
      ) : (
        <>
          <Steps
            steps={[
              { label: 'Choose files' },
              { label: 'Upload' },
              { label: 'Add metadata' },
              { label: 'Publish to NOSTR' },
            ]}
            currentStep={uploadStep}
            className="-mt-0.5"
          />
          {uploadStep <= 1 && (
            <div className="bg-muted rounded-xl p-4 text-muted-foreground gap-4 flex flex-col">
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
                <div className="text-sm text-muted-foreground flex flex-row gap-2 items-center pl-4">
                  <Info className="h-5 w-5 text-blue-500" />
                  Audio events are not widely supported yet. Currently they are only used by{' '}
                  <a className="link link-primary" href="https://stemstr.app/" target="_blank">
                    stemstr.app
                  </a>
                </div>
              )}
              <div className="bg-muted rounded-xl p-4 text-muted-foreground gap-4 flex flex-row justify-center">
                <Button
                  variant={publishCount === 0 ? 'default' : 'secondary'}
                  className="w-40"
                  onClick={() => {
                    navigate('/browse');
                  }}
                >
                  Skip publishing
                </Button>
                {publishCount > 0 && (
                  <Button className="w-40" disabled={uploadBusy} onClick={() => publishAll()}>
                    {uploadBusy ? 'Publishing…' : `Publish (${publishCount} event${publishCount > 1 ? 's' : ''})`}
                  </Button>
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
