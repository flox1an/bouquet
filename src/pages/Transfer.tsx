import {
  ArrowDownSquare,
  ArrowUpSquare,
  CheckCircle2,
  FileText,
  AlertTriangle,
  X,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Steps } from '@/components/ui/steps';
import { ServerSelect } from '../components/ServerList/ServerSelect';
import { ServerInfo, useServerInfo } from '../utils/useServerInfo';
import { useMemo, useState } from 'react';
import { BlobDescriptor } from 'blossom-client-sdk';
import { useNostr } from '../utils/nostr';
import { useQueryClient } from '@tanstack/react-query';
import { formatFileSize } from '../utils/utils';
import BlobList from '../components/BlobList/BlobList';
import { useNavigate, useParams } from 'react-router-dom';
import { transferBlob, TransferPhase } from '../utils/transfer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

type TransferError = {
  name?: string;
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

const getPercent = (value: number, max: number) => (max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0);

const SyncMeter = ({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) => {
  const percent = getPercent(value, max);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="whitespace-nowrap tabular-nums text-muted-foreground">
          {formatFileSize(value)} / {formatFileSize(max)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <Progress value={percent} className="h-2" />
        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">{percent}%</span>
      </div>
    </div>
  );
};

const SyncStat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="rounded-md border bg-muted/30 px-3 py-2">
    <div className="text-xs font-medium uppercase text-muted-foreground">{label}</div>
    <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
  </div>
);

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
  const [mirrorSupport, setMirrorSupport] = useState<Record<string, boolean | undefined>>({});

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
      return sourceBlobs?.filter(src => targetBlobs?.find(tgt => tgt.sha256 == src.sha256) == undefined) || [];
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
            allowMirror: mirrorSupport[targetServer] !== false,
            onMirrorUnsupported: () => {
              setMirrorSupport(ms => ({ ...ms, [targetServer]: false }));
            },
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
        } else if (e.name === 'SourceBlobNotFoundError') {
          errorMessage = `Missing on source server (${sourceServer})`;
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
  const currentTransfer = useMemo(() => Object.values(transferLog).find(t => t.status === 'pending'), [transferLog]);
  const isTransferComplete = started && Object.keys(transferLog).length > 0 && transferStatus.pending === 0;

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

  return (
    <div className="mx-auto flex w-full max-w-[80em] flex-col gap-4 py-1">
      <div className="-mt-0.5">{transferSteps}</div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowUpSquare className="h-4 w-4" />
              Source Server
            </CardTitle>
            <CardDescription className="truncate">
              {transferSource ? serverInfo[transferSource]?.url : 'Choose a source server'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ServerSelect
              servers={sourceServers}
              selectedServer={transferSource}
              onServerChange={setTransferSource}
              placeholder="Choose a source server"
              disabled={started}
            />
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowDownSquare className="h-4 w-4" />
              Target Server
            </CardTitle>
            <CardDescription className="truncate">
              {transferTarget ? serverInfo[transferTarget]?.url : 'Choose a target server'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ServerSelect
              servers={targetServers}
              selectedServer={transferTarget}
              onServerChange={setTransferTarget}
              placeholder="Select target server"
              disabled={started || !transferSource}
              getPreviewText={getTransferPreview}
            />
          </CardContent>
        </Card>

        <div className="flex items-start justify-end">
          {transferSource && (
            <Button variant="ghost" size="sm" onClick={() => closeTransferMode()}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {transferTarget && transferJobs && transferJobs.length > 0 ? (
        <>
          <Card className="shadow-sm">
            <CardHeader className="gap-3 pb-4 md:flex-row md:items-start md:justify-between md:space-y-0">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  {started && !isTransferComplete ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUpSquare className="h-4 w-4" />
                  )}
                  Sync Summary
                </CardTitle>
                <CardDescription>
                  {transferJobs.length} object{transferJobs.length > 1 ? 's' : ''} missing on {serverInfo[transferTarget]?.name}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {mirrorSupport[transferTarget] === false && (
                  <Badge variant="outline">Mirror unavailable on target</Badge>
                )}
                {isTransferComplete && transferStatus.error === 0 && (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Complete
                  </Badge>
                )}
                {!started ? (
                  <Button onClick={() => transferSource && performTransfer(transferSource, transferTarget, transferJobs)}>
                    <ArrowUpSquare className="mr-1 h-4 w-4" />
                    Start sync
                  </Button>
                ) : (
                  <Button variant="outline" onClick={cancelTransfer} disabled={!abortController}>
                    Cancel
                  </Button>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <SyncStat label="Total" value={transferJobs.length} />
                <SyncStat label="Completed" value={transferStatus.done} />
                <SyncStat label="Pending" value={transferStatus.pending} />
                <SyncStat label="Failed" value={transferStatus.error} />
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <SyncMeter label="Downloaded" value={transferStatus.downloaded} max={transferStatus.fullSize} />
                <SyncMeter label="Uploaded" value={transferStatus.uploaded} max={transferStatus.fullSize} />
              </div>

              {started && currentTransfer && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  <Badge variant="outline">{currentTransfer.phase || 'starting'}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">{currentTransfer.sha256.slice(0, 24)}</span>
                </div>
              )}

              {transferErrors.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{transferErrors.length} transfer error{transferErrors.length > 1 ? 's' : ''}</AlertTitle>
                  <AlertDescription>
                    <div className="mt-2 grid w-full gap-2">
                      {transferErrors.map(t => (
                        <div key={t.sha256} className="grid gap-2 rounded-md border border-destructive/20 bg-background/60 p-2 text-xs md:grid-cols-[1fr_auto_auto]">
                          <span className="flex min-w-0 items-center gap-2 font-mono">
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{t.sha256}</span>
                          </span>
                          <span className="whitespace-nowrap text-muted-foreground">{formatFileSize(t.size)}</span>
                          <span className="text-destructive">{t.message}</span>
                        </div>
                      ))}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {!started && <BlobList blobs={transferJobs} />}
        </>
      ) : (
        <Card className="shadow-sm">
          <CardContent className="flex min-h-40 items-center justify-center p-8 text-center text-sm text-muted-foreground">
            {transferTarget ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                No missing objects to transfer.
              </div>
            ) : transferSource ? (
              <>Select a target server above.</>
            ) : (
              <>Select a source server above.</>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
