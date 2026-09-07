import { ArrowDownSquare, ArrowUpSquare, CheckCircle2, FileText, AlertTriangle, X, Loader2 } from 'lucide-react';
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
import { getCatalogClient } from '../catalog/catalogClient';
import ServerListPopup from '../components/ServerListPopup';
import { useUserServers, type Server } from '../utils/useUserServers';
import { mediaServer } from '../utils/server';
import { runTasks } from '../utils/run';
import { formatTransferError } from '../utils/upload';


type TransferStatus = {
  [key: string]: {
    sha256: string;
    status: 'pending' | 'done' | 'error' | 'cancelled';
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

const SyncMeter = ({ label, value, max }: { label: string; value: number; max: number }) => {
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
  const { storeUserServers } = useUserServers();
  const [isServerListDialogOpen, setIsServerListDialogOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<string | undefined>();
  const { user, signEventTemplate } = useNostr();
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
      const sourceServer = serverInfo[transferSource];
      const targetServer = serverInfo[transferTarget];
      if (!sourceServer || !targetServer) return [];
      const sourceBlobs = sourceServer.blobs;
      const targetBlobs = targetServer.blobs;
      return sourceBlobs?.filter(src => targetBlobs?.find(tgt => tgt.sha256 == src.sha256) == undefined) || [];
    }
    return [];
  }, [serverInfo, transferSource, transferTarget]);

  // Loading/unreachable listings must never be presented as a confirmed
  // zero-difference "nothing to sync" - that hides real inventory the app
  // simply hasn't read yet.
  const inventoryStatus = useMemo((): 'loading' | 'error' | 'ready' => {
    if (!transferSource || !transferTarget) return 'ready';
    const sourceServer = serverInfo[transferSource];
    const targetServer = serverInfo[transferTarget];
    if (sourceServer?.isError || targetServer?.isError) return 'error';
    if (sourceServer?.isLoading || targetServer?.isLoading) return 'loading';
    return 'ready';
  }, [serverInfo, transferSource, transferTarget]);

  const getTransferPreview = (targetServer: ServerInfo): string | undefined => {
    if (!transferSource || !serverInfo[transferSource]) return undefined;
    const sourceBlobs = serverInfo[transferSource].blobs;
    const targetBlobs = targetServer.blobs;
    if (!sourceBlobs) return undefined;

    const missingCount = sourceBlobs.filter(src => !targetBlobs?.find(tgt => tgt.sha256 === src.sha256)).length;

    if (missingCount === 0) {
      return 'No files to transfer';
    }
    return `${missingCount} file${missingCount > 1 ? 's' : ''} to transfer`;
  };

  const performTransfer = async (
    sourceServer: string,
    targetServer: string,
    blobs: BlobDescriptor[],
    // A retry covers only the failures, so it must not erase the successes
    // already recorded for this run.
    { resetLog = true }: { resetLog?: boolean } = {}
  ) => {
    if (resetLog) setTransferLog({});
    const controller = new AbortController();
    setAbortController(controller);
    setStarted(true);
    const result = await runTasks(
      blobs,
      async b => {
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

        try {
          await transferBlob(`${serverInfo[sourceServer].url}/${b.sha256}`, serverInfo[targetServer], signEventTemplate, {
            signal: controller.signal,
            timeout: 120000,
            maxRetries: 2,
            allowMirror: mirrorSupport[targetServer] !== false,
            onMirrorUnsupported: () => {
              setMirrorSupport(ms => ({ ...ms, [targetServer]: false }));
            },
            onPhaseChange: phase => {
              setTransferLog(ts => ({
                ...ts,
                [b.sha256]: { ...ts[b.sha256], phase },
              }));
            },
            onProgress: progressEvent => {
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
            onCompleted: (blob, method) => {
              if (!user?.pubkey) return;
              return getCatalogClient()
                .ingestUpload(
                  user.pubkey,
                  { url: serverInfo[targetServer].url, type: serverInfo[targetServer].type },
                  blob,
                  method === 'mirror'
                )
                .catch(() => undefined);
            },
          });
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
        } catch (error) {
          setTransferLog(ts => ({
            ...ts,
            [b.sha256]: {
              ...ts[b.sha256],
              status: 'error',
              phase: 'error',
              message: formatTransferError(error, sourceServer),
            },
          }));
          throw error;
        }
      },
      { concurrency: 1, signal: controller.signal }
    );
    // Tasks the runner never got to dequeue before the abort still need a
    // visible, resumable record - otherwise "Resume remaining" can't see them.
    for (const [index, outcome] of result.outcomes.entries()) {
      if (outcome.state !== 'cancelled') continue;
      const blob = blobs[index];
      setTransferLog(ts =>
        ts[blob.sha256]
          ? ts
          : { ...ts, [blob.sha256]: { sha256: blob.sha256, status: 'cancelled', size: blob.size, retries: 0 } }
      );
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
  const transferCancelled = useMemo(
    () => Object.values(transferLog).filter(b => b.status === 'cancelled'),
    [transferLog]
  );
  const transferResumable = useMemo(
    () => [...transferErrors, ...transferCancelled],
    [transferErrors, transferCancelled]
  );
  const currentTransfer = useMemo(() => Object.values(transferLog).find(t => t.status === 'pending'), [transferLog]);
  const isTransferComplete = started && Object.keys(transferLog).length > 0 && transferStatus.pending === 0;

  const currentTransferStep = transferSource ? (transferTarget ? 2 : 1) : 0;
  const transferSteps = (
    <Steps
      steps={[{ label: 'Choose source' }, { label: 'Choose target' }, { label: 'Sync files' }]}
      currentStep={currentTransferStep}
    />
  );

  const sourceServers = Object.values(serverInfo)
    .filter(s => !s.virtual)
    .sort((a, b) => a.name.localeCompare(b.name));

  const targetServers = Object.values(serverInfo)
    .filter(server => mediaServer(server).capabilities.mirror)
    .filter(server => server.name !== transferSource)
    .filter(server => !server.virtual)
    .sort((a, b) => a.name.localeCompare(b.name));

  const hasConfiguredServers = sourceServers.length > 0;
  const hasValidTarget = targetServers.length > 0;
  const hasStaleSource = Boolean(transferSource && !serverInfo[transferSource]);

  const handleSaveServers = async (newServers: Server[]) => {
    await storeUserServers(newServers);
  };

  return (
    <div className="mx-auto flex w-full max-w-[80em] flex-col gap-4 py-1">
      <div className="-mt-0.5">{transferSteps}</div>

      {!hasConfiguredServers ? (
        <Card className="shadow-sm">
          <CardContent className="flex min-h-40 flex-col items-center justify-center gap-3 p-8 text-center">
            <AlertTriangle className="h-7 w-7" />
            <div>
              <p className="font-semibold">No media servers configured yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add a Blossom server to choose a source and sync your media files.
              </p>
            </div>
            <Button onClick={() => setIsServerListDialogOpen(true)}>Manage servers</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {hasStaleSource && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>This source server is no longer configured</AlertTitle>
              <AlertDescription>
                Choose a currently configured source server below, or manage your servers.
              </AlertDescription>
            </Alert>
          )}
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
                  selectedServer={hasStaleSource ? undefined : transferSource}
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
                  disabled={started || !transferSource || hasStaleSource || !hasValidTarget}
                  getPreviewText={getTransferPreview}
                />
                {!hasValidTarget && (
                  <div className="mt-3 border-t pt-3 text-sm text-muted-foreground">
                    Sync needs a second Blossom server as its target.{' '}
                    <Button variant="link" className="h-auto p-0" onClick={() => setIsServerListDialogOpen(true)}>
                      Manage servers
                    </Button>
                  </div>
                )}
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
        </>
      )}

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
                  {transferJobs.length} media file{transferJobs.length > 1 ? 's' : ''} missing on{' '}
                  {serverInfo[transferTarget]?.name}
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
                  <Button
                    onClick={() => transferSource && performTransfer(transferSource, transferTarget, transferJobs)}
                  >
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
                  <span className="text-xs text-muted-foreground">
                    Transferring media file <span className="font-mono">{currentTransfer.sha256.slice(0, 24)}</span>
                  </span>
                </div>
              )}

              {transferResumable.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>
                    {transferResumable.length} transfer{transferResumable.length > 1 ? 's' : ''} need attention
                  </AlertTitle>
                  <AlertDescription>
                    <div className="mt-2 grid w-full gap-2">
                      {transferResumable.map(t => (
                        <div
                          key={t.sha256}
                          className="grid gap-2 rounded-md border border-destructive/20 bg-background/60 p-2 text-xs md:grid-cols-[1fr_auto_auto]"
                        >
                          <span className="flex min-w-0 items-center gap-2 font-mono">
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{t.sha256}</span>
                          </span>
                          <span className="whitespace-nowrap text-muted-foreground">{formatFileSize(t.size)}</span>
                          <span className="text-destructive">
                            {t.status === 'cancelled' ? 'Cancelled before it started' : t.message}
                          </span>
                        </div>
                      ))}
                    </div>
                    {/* Without this the only way past a partial failure or cancellation is to
                        run the whole transfer again, including everything that already worked. */}
                    <Button
                      className="mt-3"
                      size="sm"
                      variant="outline"
                      disabled={Boolean(abortController)}
                      onClick={() => {
                        const remaining = transferJobs?.filter(job =>
                          transferResumable.some(t => t.sha256 === job.sha256)
                        );
                        if (transferSource && remaining?.length) {
                          void performTransfer(transferSource, transferTarget, remaining, { resetLog: false });
                        }
                      }}
                    >
                      Resume {transferResumable.length} remaining transfer{transferResumable.length > 1 ? 's' : ''}
                    </Button>
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
            {transferTarget && inventoryStatus === 'loading' ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Checking file inventory…
              </div>
            ) : transferTarget && inventoryStatus === 'error' ? (
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Could not read this server&apos;s file list. Try rescanning your servers.
              </div>
            ) : transferTarget ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                No missing files to transfer.
              </div>
            ) : transferSource ? (
              <>Select a target server above.</>
            ) : (
              <>Select a source server above.</>
            )}
          </CardContent>
        </Card>
      )}

      <ServerListPopup
        isOpen={isServerListDialogOpen}
        onClose={() => setIsServerListDialogOpen(false)}
        onSave={handleSaveServers}
        initialServers={Object.values(serverInfo).filter(s => !s.virtual)}
      />
    </div>
  );
};
