import {
  ArrowDownSquare,
  ArrowUpSquare,
  CheckCircle2,
  FileText,
  AlertTriangle,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Steps } from '@/components/ui/steps';
import { ServerSelect } from '../components/ServerList/ServerSelect';
import { ServerInfo, useServerInfo } from '../utils/useServerInfo';
import { Label } from '@/components/ui/label';
import { useMemo, useState } from 'react';
import { BlobDescriptor } from 'blossom-client-sdk';
import { useNostr } from '../utils/nostr';
import { useQueryClient } from '@tanstack/react-query';
import { formatFileSize } from '../utils/utils';
import BlobList from '../components/BlobList/BlobList';
import './Transfer.css';
import { useNavigate, useParams } from 'react-router-dom';
import ProgressBar from '../components/ProgressBar/ProgressBar';
import { transferBlob, TransferPhase } from '../utils/transfer';

type TransferError = {
  message?: string;
  code?: string;
  response?: {
    status?: number;
  };
};

type TransferStatus = {
  [key: string]: {
    sha256: string;
    status: 'pending' | 'done' | 'error';
    phase?: TransferPhase;
    message?: string;
    size: number;
    uploaded?: number;
    rate?: number;
    downloaded?: number;
    retries?: number;
  };
};

export const Transfer = () => {
  // TODO add transfer for single files
  // TODO add support for mirror command (fallback to upload)

  const { source } = useParams();
  const [transferSource, setTransferSource] = useState(source);
  const navigate = useNavigate();
  const { serverInfo } = useServerInfo();
  const [transferTarget, setTransferTarget] = useState<string | undefined>();
  const { signEventTemplate } = useNostr();
  const queryClient = useQueryClient();
  const [started, setStarted] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const [transferLog, setTransferLog] = useState<TransferStatus>({});

  const closeTransferMode = () => {
    queryClient.invalidateQueries({ queryKey: ['blobs', transferTarget] });
    setTransferTarget(undefined);
    setTransferLog({});
    setStarted(false);
    navigate('/browse');
  };

  const transferJobs = useMemo(() => {
    if (transferSource && transferTarget) {
      const sourceBlobs = serverInfo[transferSource].blobs;
      const targetBlobs = serverInfo[transferTarget].blobs;
      return sourceBlobs?.filter(src => targetBlobs?.find(tgt => tgt.sha256 == src.sha256) == undefined);
    }
    return [];
  }, [serverInfo, transferSource, transferTarget]);

  const getTransferPreview = (targetServer: ServerInfo): string | undefined => {
    if (!transferSource || !serverInfo[transferSource]) return undefined;
    const sourceBlobs = serverInfo[transferSource].blobs;
    const targetBlobs = targetServer.blobs;
    if (!sourceBlobs) return undefined;

    const missingCount = sourceBlobs.filter(
      src => !targetBlobs?.find(tgt => tgt.sha256 === src.sha256)
    ).length;

    if (missingCount === 0) {
      return 'No objects to transfer';
    }
    return `${missingCount} object${missingCount > 1 ? 's' : ''} to transfer`;
  };

  const performTransfer = async (sourceServer: string, targetServer: string, blobs: BlobDescriptor[]) => {
    setTransferLog({});
    const controller = new AbortController();
    setAbortController(controller);
    setStarted(true);

    for (const b of blobs) {
      if (controller.signal.aborted) break;

      try {
        setTransferLog(ts => ({
          ...ts,
          [b.sha256]: {
            sha256: b.sha256,
            status: 'pending',
            phase: 'mirroring',
            size: b.size,
            uploaded: 0,
            rate: 0,
            downloaded: 0,
            retries: 0,
          },
        }));

        await transferBlob(
          `${serverInfo[sourceServer].url}/${b.sha256}`,
          serverInfo[targetServer],
          signEventTemplate,
          {
            signal: controller.signal,
            timeout: 120000,
            maxRetries: 2,
            onPhaseChange: (phase) => {
              setTransferLog(ts => ({
                ...ts,
                [b.sha256]: {
                  ...ts[b.sha256],
                  phase,
                },
              }));
            },
            onProgress: (progressEvent) => {
              setTransferLog(ts => ({
                ...ts,
                [b.sha256]: {
                  ...ts[b.sha256],
                  uploaded: progressEvent.loaded,
                  downloaded: progressEvent.loaded,
                  rate: progressEvent.rate || 0,
                },
              }));
            },
          }
        );

        setTransferLog(ts => ({
          ...ts,
          [b.sha256]: {
            ...ts[b.sha256],
            phase: 'completed',
            rate: 0,
            uploaded: ts[b.sha256].size,
            downloaded: ts[b.sha256].size,
            status: 'done',
          },
        }));
      } catch (error: unknown) {
        const e = error as TransferError;
        console.error(`Transfer failed for ${b.sha256}:`, e);

        let errorMessage = 'Unknown error';
        if (e.message?.includes('cancelled')) {
          errorMessage = 'Transfer cancelled';
        } else if (e.message?.includes('timeout')) {
          errorMessage = 'Operation timed out';
        } else if (e.response?.status === 404) {
          errorMessage = 'Blob not found (404)';
        } else if (e.response?.status === 401 || e.response?.status === 403) {
          errorMessage = 'Authentication failed';
        } else if ((e.response?.status ?? 0) >= 500) {
          errorMessage = `Server error (${e.response?.status ?? 'unknown'})`;
        } else if (e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT') {
          errorMessage = 'Network error';
        } else if (e.message) {
          errorMessage = e.message;
        }

        setTransferLog(ts => ({
          ...ts,
          [b.sha256]: {
            ...ts[b.sha256],
            status: 'error',
            phase: 'error',
            message: errorMessage,
          },
        }));
      }
    }

    setAbortController(null);
  };

  const cancelTransfer = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
  };

  const transferStatus = useMemo(() => {
    const stats = Object.values(transferLog).reduce(
      (acc, t) => {
        if (t.status === 'done') {
          acc.done += 1;
        } else if (t.status === 'error') {
          acc.error += 1;
        } else {
          acc.pending += 1;
        }
        acc.size += t.status == 'done' ? t.size : 0;
        acc.downloaded += t.downloaded || 0;
        acc.uploaded += t.uploaded || 0;
        return acc;
      },
      { pending: 0, done: 0, error: 0, size: 0, downloaded: 0, uploaded: 0 }
    );
    return { ...stats, fullSize: transferJobs?.reduce((acc, b) => acc + b.size, 0) || 0 };
  }, [transferLog, transferJobs]);

  const transferErrors = useMemo(() => Object.values(transferLog).filter(b => b.status == 'error'), [transferLog]);

  const currentTransferStep = transferSource ? (transferTarget ? 2 : 1) : 0;
  const transferSteps = (
    <Steps
      steps={[
        { label: 'Choose source' },
        { label: 'Choose target' },
        { label: 'Sync blobs' },
      ]}
      currentStep={currentTransferStep}
    />
  );

  const sourceServers = Object.values(serverInfo)
    .filter(s => !s.virtual)
    .sort((a, b) => a.name.localeCompare(b.name));

  const targetServers = Object.values(serverInfo)
    .filter(s => s.type === 'blossom')
    .filter(s => s.name !== transferSource)
    .filter(s => !s.virtual)
    .sort((a, b) => a.name.localeCompare(b.name));

  return transferSource ? (
    <div className="flex flex-col mx-auto max-w-[80em] w-full">
      {transferSteps}

      <div className="grid gap-6 md:grid-cols-2 py-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <ArrowUpSquare className="h-4 w-4" />
              Source Server
            </Label>
            <Button variant="ghost" size="sm" onClick={() => closeTransferMode()}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ServerSelect
            servers={sourceServers}
            selectedServer={transferSource}
            onServerChange={setTransferSource}
            disabled={started}
          />
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <ArrowDownSquare className="h-4 w-4" />
            Target Server
          </Label>
          <ServerSelect
            servers={targetServers}
            selectedServer={transferTarget}
            onServerChange={setTransferTarget}
            placeholder="Select target server"
            disabled={started}
            getPreviewText={getTransferPreview}
          />
        </div>
      </div>
      {transferTarget && transferJobs && transferJobs.length > 0 ? (
        <>
          <div className="bg-muted rounded-xl p-4 text-muted-foreground gap-4 flex flex-col my-4">
            <div className="message">
              {transferJobs.length} object{transferJobs.length > 1 ? 's' : ''} to transfer{' '}
              {!started && (
                <Button
                  onClick={() => performTransfer(transferSource, transferTarget, transferJobs)}
                >
                  <ArrowUpSquare className="h-4 w-4 mr-1" />
                  Start
                </Button>
              )}
            </div>
            <div className="w-5/6">
              <ProgressBar
                value={transferStatus.downloaded}
                max={transferStatus.fullSize}
                description={
                  formatFileSize(transferStatus.downloaded) +
                  ' / ' +
                  formatFileSize(transferStatus.fullSize) +
                  ' downloaded'
                }
              />

              <ProgressBar
                value={transferStatus.uploaded}
                max={transferStatus.fullSize}
                description={
                  formatFileSize(transferStatus.uploaded) +
                  ' / ' +
                  formatFileSize(transferStatus.fullSize) +
                  ' uploaded'
                }
              />

              {started && (
                <div className="message mt-4">
                  <strong>Status:</strong> {transferStatus.done} completed, {transferStatus.pending} pending, {transferStatus.error} failed
                  {Object.values(transferLog).find(t => t.status === 'pending') && (
                    <div className="mt-2">
                      <strong>Current:</strong> {Object.values(transferLog).find(t => t.status === 'pending')?.sha256.substring(0, 16)}... 
                      {' - '}{Object.values(transferLog).find(t => t.status === 'pending')?.phase || 'starting'}
                    </div>
                  )}
                </div>
              )}
              {transferErrors.length > 0 && (
                <>
                  <h2>Errors</h2>
                  <div className="error-log">
                    {transferErrors.map(t => (
                      <div key={t.sha256}>
                        <span>
                          <FileText className="h-4 w-4" />
                        </span>
                        <span>{t.sha256}</span>
                        <span>{formatFileSize(t.size)}</span>
                        <span>{t.status && (t.status == 'error' ? <AlertTriangle className="h-4 w-4" /> : '')}</span>
                        <span>{t.message}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <Button onClick={cancelTransfer} disabled={!abortController}>
              Cancel transfer
            </Button>
          </div>
          {!started && <BlobList blobs={transferJobs}></BlobList>}
        </>
      ) : (
        <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
          {transferTarget ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-green-500" /> No missing objects to transfer
            </>
          ) : (
            <>Select a target server above</>
          )}
        </div>
      )}
    </div>
  ) : (
    <div className="flex flex-col mx-auto max-w-[80em] w-full">
      {transferSteps}
      <div className="py-4 max-w-md">
        <Label className="flex items-center gap-2 mb-2">
          <ArrowUpSquare className="h-4 w-4" />
          Select Source Server
        </Label>
        <ServerSelect
          servers={sourceServers}
          selectedServer={transferSource}
          onServerChange={s => setTransferSource(s)}
          placeholder="Choose a source server"
        />
      </div>
    </div>
  );
};
