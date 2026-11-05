import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BlobDescriptor } from 'blossom-client-sdk';
import { useNostr } from '../utils/nostr';
import { useServerInfo } from '../utils/useServerInfo';
import { removeExifData } from '../utils/exif';
import { isCancel, type AxiosError } from 'axios';
import FileEventEditor, { FileEventData } from '../components/FileEventEditor/FileEventEditor';
import { Server, useUserServers } from '../utils/useUserServers';
import { resizeImage } from '../utils/resize';
import { getBlurhashAndSizeFromFile } from '../utils/blur';
import UploadFileSelection, { ResizeOptions, TransferStats } from '../components/UploadFileSelection';
import UploadProgress from '../components/UploadProgress';
import { extractDomain } from '../utils/utils';
import { transferBlob } from '../utils/transfer';
import { formatUploadError } from '../utils/upload';
import { usePublishing } from '../components/FileEventEditor/usePublishing';
import { useNavigate, useLocation } from 'react-router-dom';
import type { NostrEvent } from 'nostr-tools';
import { Button } from '@/components/ui/button';
import { Steps } from '@/components/ui/steps';
import UploadPublished, {
  type FileEventPublishState,
  type PublishJobKind,
  type PublishOutcome,
} from '../components/UploadPublished';
import { Info } from 'lucide-react';
import UploadOnboarding from '../components/UploadOboarding';
import { toast } from '@/hooks/use-toast';
import { getCatalogClient } from '../catalog/catalogClient';
import { MediaServerError, mediaServer } from '../utils/server';
import { uploadFiles, type UploadTask } from '../utils/uploadRun';
import { PageHeader } from '@/components/ui/page-header';
import { retryFailedTargets } from '../utils/publish';

/** Bytes sent per task and finished tasks of the current upload, kept across retries. */
type UploadRun = { tasks: UploadTask[]; loaded: Map<UploadTask, number>; done: Set<UploadTask> };

/** A file counts as uploaded once every server it was sent to has it. */
const countDoneFiles = ({ tasks, done }: UploadRun) =>
  new Set(tasks.map(t => t.file)).size - new Set(tasks.filter(t => !done.has(t)).map(t => t.file)).size;

function Upload() {
  const { servers, serversLoading } = useUserServers();
  const { user, signEventTemplate } = useNostr();
  const { serverInfo } = useServerInfo();
  const location = useLocation();
  const [transfers, setTransfers] = useState<{ [key: string]: TransferStats }>({});
  const [files, setFiles] = useState<File[]>([]);
  const [cleanPrivateData, setCleanPrivateData] = useState(true);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [fileEventsToPublish, setFileEventsToPublish] = useState<FileEventPublishState[]>([]);
  const [imageResize, setImageResize] = useState(0);
  const [uploadStep, setUploadStep] = useState(0);
  const [retryingKey, setRetryingKey] = useState<string | undefined>();
  const [failedUploadTasks, setFailedUploadTasks] = useState<UploadTask[]>([]);
  const [cancelled, setCancelled] = useState(false);
  const [filesProgress, setFilesProgress] = useState({ done: 0, total: 0 });
  const runRef = useRef<UploadRun>({ tasks: [], loaded: new Map(), done: new Set() });
  const abortRef = useRef<AbortController | undefined>(undefined);
  const dimensionsRef = useRef<{ [key: string]: FileEventData }>({});
  const { publishFileEvent, publishAudioEvent, publishVideoEvent } = usePublishing();
  const uploadedFilesRef = useRef<File[]>([]);
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

  const upload = async (retryTasks?: UploadTask[]) => {
    const controller = new AbortController();
    abortRef.current = controller;
    setUploadBusy(true);
    setCancelled(false);
    const isRetry = Boolean(retryTasks && retryTasks.length > 0);
    if (!isRetry) {
      setPreparing(true);
    }

    let uploadVerdict: 'allSucceeded' | 'failed' | 'cancelled' = 'allSucceeded';
    try {
      setUploadStep(1);
      // TODO this blocks the UI
      const filesToUpload: File[] = isRetry ? uploadedFilesRef.current : await getListOfFilesToUpload();
      const fileDimensions = isRetry ? dimensionsRef.current : await getPreUploadMetaData(filesToUpload);
      if (!isRetry) {
        uploadedFilesRef.current = filesToUpload;
        dimensionsRef.current = fileDimensions;
        setPreparing(false);
      }

      // TODO detect if the file already exists? if we have the hash??

      if (filesToUpload && filesToUpload.length) {
        const enabledServers = servers.filter(server => transfers[server.name]?.enabled);
        const primaryServerName = servers[0]?.name;
        const orderedServers = [...enabledServers].sort(
          (left, right) => Number(right.name === primaryServerName) - Number(left.name === primaryServerName)
        );
        const uploadTasks: UploadTask[] = isRetry
          ? (retryTasks as UploadTask[])
          : orderedServers.flatMap(server => filesToUpload.map(file => ({ server, file })));
        if (!isRetry) runRef.current = { tasks: uploadTasks, loaded: new Map(), done: new Set() };
        const run = runRef.current;
        setFilesProgress({ done: countDoneFiles(run), total: filesToUpload.length });

        setTransfers(ut => {
          const newTransfers = { ...ut };
          if (isRetry) {
            for (const task of uploadTasks) {
              if (newTransfers[task.server.name]) {
                newTransfers[task.server.name].error = undefined;
              }
            }
          } else {
            const totalSize = filesToUpload.reduce((acc, f) => acc + f.size, 0);
            for (const server of servers) {
              if (newTransfers[server.name]?.enabled) {
                newTransfers[server.name].size = totalSize;
                newTransfers[server.name].error = undefined;
              }
            }
          }
          return newTransfers;
        });

        const serverLoaded = (name: string) => {
          let sum = 0;
          for (const [task, bytes] of run.loaded) if (task.server.name === name) sum += bytes;
          return sum;
        };
        const result = await uploadFiles({
          tasks: uploadTasks,
          files: filesToUpload,
          servers: orderedServers,
          sign: signEventTemplate,
          resolveServer: mediaServer,
          signal: controller.signal,
          onProgress: (task, progress) => {
            run.loaded.set(task, progress.loaded);
            setTransfers(current => ({
              ...current,
              [task.server.name]: {
                ...current[task.server.name],
                transferred: serverLoaded(task.server.name),
                rate: progress.rate || 0,
              },
            }));
          },
          onTaskDone: task => {
            run.loaded.set(task, task.file.size);
            run.done.add(task);
            setTransfers(current => ({
              ...current,
              [task.server.name]: { ...current[task.server.name], transferred: serverLoaded(task.server.name) },
            }));
            setFilesProgress({ done: countDoneFiles(run), total: filesToUpload.length });
          },
        });
        uploadVerdict = result.verdict;
        const remainingFailedTasks: UploadTask[] = [];
        result.outcomes.forEach((outcome, index) => {
          if (outcome.state !== 'done') {
            const task = uploadTasks[index];
            remainingFailedTasks.push(task);
            const wasCancelled =
              outcome.state === 'cancelled' ||
              isCancel(outcome.error instanceof MediaServerError ? outcome.error.cause : outcome.error);
            const message =
              outcome.state === 'error' && !wasCancelled ? formatUploadError(outcome.error as AxiosError) : undefined;
            setTransfers(current => ({
              ...current,
              // A real failure on this server outranks "Cancelled" from its other tasks.
              [task.server.name]: {
                ...current[task.server.name],
                error: message ?? current[task.server.name]?.error ?? 'Cancelled',
              },
            }));
            return;
          }
          const { task, descriptor } = outcome.value;
          const existingUrls = fileDimensions[task.file.name]?.url ?? [];
          fileDimensions[task.file.name] = {
            ...fileDimensions[task.file.name],
            x: descriptor.sha256,
            url: existingUrls.includes(descriptor.url)
              ? existingUrls
              : task.server.name === primaryServerName
                ? [descriptor.url, ...existingUrls]
                : [...existingUrls, descriptor.url],
            size: descriptor.size || fileDimensions[task.file.name]?.size,
            m: descriptor.type,
          };
          if (user?.pubkey)
            void getCatalogClient()
              .ingestUpload(user.pubkey, { url: task.server.url, type: task.server.type }, descriptor)
              .catch(() => undefined);
        });
        setFailedUploadTasks(remainingFailedTasks);
        setCancelled(result.verdict === 'cancelled');
        if (result.verdict === 'allSucceeded' && !isRetry) setFiles([]);
      }
      if (uploadVerdict === 'allSucceeded') {
        setFailedUploadTasks([]);
        setFiles([]);
        const drafts = filesToUpload
          .map(file => fileDimensions[file.name])
          .filter((fe): fe is FileEventData => Boolean(fe && fe.x && fe.url.length > 0));
        setFileEventsToPublish(drafts);
        setUploadStep(2);
      }
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : String(error);
      toast({
        variant: 'destructive',
        title: 'Unable to prepare files',
        description: message,
      });
      setUploadStep(0);
    } finally {
      setPreparing(false);
      setUploadBusy(false);
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

    setFailedUploadTasks([]);
    dimensionsRef.current = {};
    uploadedFilesRef.current = [];
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
                  return getCatalogClient()
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

  const publishOne = async (fe: FileEventData, kind: PublishJobKind, persistThumbnailToState: boolean) => {
    const publishFn = kind === 'file' ? publishFileEvent : kind === 'audio' ? publishAudioEvent : publishVideoEvent;
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

    const setOutcome = (outcome: PublishOutcome) =>
      setFileEventsToPublish(prev =>
        prev.map(f =>
          f.x === fe.x
            ? {
                ...f,
                ...statePatch,
                publishOutcomes: [...(f.publishOutcomes ?? []).filter(o => o.kind !== kind), outcome],
              }
            : f
        )
      );

    try {
      const result = await publishFn(dataToPublish);
      setOutcome({ kind, result });
    } catch (error) {
      setOutcome({ kind, error: error instanceof Error ? error.message : String(error) });
    }
  };

  const publishAll = async () => {
    setUploadBusy(true);
    try {
      const jobs = fileEventsToPublish.flatMap(fe => [
        ...(fe.publish.file ? [publishOne(fe, 'file', false)] : []),
        ...(fe.publish.audio ? [publishOne(fe, 'audio', false)] : []),
        ...(fe.publish.video ? [publishOne(fe, 'video', true)] : []),
      ]);
      await Promise.all(jobs);
      setUploadStep(3);
    } finally {
      setUploadBusy(false);
    }
  };

  const retryPublishOutcome = async (fileX: string, kind: PublishJobKind) => {
    const fe = fileEventsToPublish.find(f => f.x === fileX);
    if (!fe) return;
    const outcome = fe.publishOutcomes?.find(o => o.kind === kind);
    setRetryingKey(`${fileX}:${kind}`);
    try {
      if (!outcome || 'error' in outcome) {
        await publishOne(fe, kind, kind === 'video');
        return;
      }
      const updated = await retryFailedTargets(outcome.result);
      setFileEventsToPublish(prev =>
        prev.map(f =>
          f.x === fileX
            ? {
                ...f,
                publishOutcomes: (f.publishOutcomes ?? []).map(o => (o.kind === kind ? { kind, result: updated } : o)),
              }
            : f
        )
      );
    } finally {
      setRetryingKey(undefined);
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
      <PageHeader title="Upload" description="Store files on your servers, then optionally publish them as posts." />
      {!serversLoading && (!servers || servers.length == 0) ? (
        <UploadOnboarding />
      ) : (
        <>
          <Steps
            steps={[
              { label: 'Choose files' },
              { label: 'Upload files' },
              { label: 'Describe media' },
              { label: 'Publish posts' },
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

              {uploadStep == 1 && (
                <UploadProgress
                  servers={servers}
                  transfers={transfers}
                  preparing={preparing}
                  uploadBusy={uploadBusy}
                  filesDone={filesProgress.done}
                  filesTotal={filesProgress.total}
                  cancelled={cancelled}
                  failedCount={failedUploadTasks.length}
                  onRetry={() => void upload(failedUploadTasks)}
                  onCancel={() => abortRef.current?.abort()}
                  onBack={clearTransfers}
                />
              )}
            </div>
          )}
          {uploadStep == 2 && fileEventsToPublish.length > 0 && (
            <div className="gap-4 flex flex-col">
              <h2 className="text-lg font-semibold">Publish posts</h2>
              <p className="text-sm text-muted-foreground">
                Your files are already on the servers; publishing creates posts that make them visible to other people.
              </p>
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
                  <Info className="h-5 w-5 shrink-0" aria-hidden="true" />
                  Audio posts are not widely supported yet. Currently they are only used by{' '}
                  <a className="text-primary hover:underline" href="https://stemstr.app/" target="_blank" rel="noreferrer">
                    stemstr.app<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </div>
              )}
              <div className="bg-muted rounded-xl p-4 text-muted-foreground gap-4 flex flex-row flex-wrap justify-center">
                <Button
                  variant={publishCount === 0 ? 'default' : 'secondary'}
                  className="w-full max-w-40 sm:w-40"
                  onClick={() => {
                    navigate('/browse');
                  }}
                >
                  Skip publishing
                </Button>
                {publishCount > 0 && (
                  <Button className="w-full max-w-40 sm:w-40" disabled={uploadBusy} onClick={() => publishAll()}>
                    {uploadBusy ? 'Publishing…' : `Publish ${publishCount} ${publishCount === 1 ? 'post' : 'posts'}`}
                  </Button>
                )}
              </div>
            </div>
          )}
          {uploadStep == 3 && (
            <UploadPublished
              fileEventsToPublish={fileEventsToPublish}
              onRetry={(fileX, kind) => void retryPublishOutcome(fileX, kind)}
              retryingKey={retryingKey}
            />
          )}
        </>
      )}
    </div>
  );
}

export default Upload;
