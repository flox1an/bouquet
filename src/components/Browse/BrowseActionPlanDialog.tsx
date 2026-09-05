import { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { BlobDescriptor, EventTemplate, SignedEvent } from 'blossom-client-sdk';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleSlash, Loader2, ShieldAlert, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { formatFileSize } from '../../utils/utils';
import { normalizeServerUrl, type BlobRemoval, type CatalogServerType } from '../../catalog/catalog';
import { getCatalogClient } from '../../catalog/catalogClient';
import { buildReplicaOps, type AssetReplica, type CatalogAction, type ReplicaOp } from '../../catalog/catalog';
import { mediaServer } from '../../utils/server';
import { probeReplica } from '../../catalog/availabilityFetch';
import { transferBlob, type TransferPhase } from '../../utils/transfer';
import { runTasks } from '../../utils/run';
import {
  finishDiagnosticRun,
  recordDiagnosticError,
  startDiagnosticRun,
  updateDiagnosticRun,
  type DiagnosticRun,
} from '../../utils/diagnostics';
import type { ServerInfo } from '../../utils/useServerInfo';
import { ServerSelect } from '../ServerList/ServerSelect';
import type { TimelineItem } from './browseConstants';

const CONCURRENCY = 5;
const TRANSFER_CONCURRENCY = 2;
type RowState = 'pending' | 'running' | 'done' | 'not_found' | 'error';
type Row = {
  key: string;
  label: string;
  state: RowState;
  message?: string;
  phase?: TransferPhase;
  loaded?: number;
  total?: number;
};

type AssetPlan = { item: TimelineItem; allowed: boolean; reason?: string; targets: string[] };

type BrowseActionPlanDialogProps = {
  open: boolean;
  action: CatalogAction;
  assets: TimelineItem[];
  pubkey: string;
  serverInfo: Record<string, ServerInfo>;
  signEventTemplate: (template: EventTemplate) => Promise<SignedEvent>;
  onClose: () => void;
  onDeleted: () => void;
};

const ACTION_LABEL: Record<CatalogAction, string> = { mirror: 'Mirror', sync: 'Sync', delete: 'Delete' };
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unknown error');

export function BrowseActionPlanDialog({
  open,
  action,
  assets,
  pubkey,
  serverInfo,
  signEventTemplate,
  onClose,
  onDeleted,
}: BrowseActionPlanDialogProps) {
  const queryClient = useQueryClient();
  const [plans, setPlans] = useState<AssetPlan[]>();
  const [phase, setPhase] = useState<'planning' | 'reviewing' | 'running' | 'complete' | 'failed'>('planning');
  const [failureMessage, setFailureMessage] = useState<string>();
  const [rows, setRows] = useState<Row[]>([]);
  const [chosenServerName, setChosenServerName] = useState<string>();
  const [mirrorSupport, setMirrorSupport] = useState<Record<string, boolean>>({});
  const [syncGapCount, setSyncGapCount] = useState<number>();
  const [replicaMaps, setReplicaMaps] = useState<AssetReplica[][]>([]);
  const cancelledRef = useRef(false);
  const deleteAbortRef = useRef<AbortController | undefined>(undefined);
  const transferAbortRef = useRef<AbortController | undefined>(undefined);
  const failedRef = useRef(false);
  const diagnosticRunRef = useRef<DiagnosticRun | undefined>(undefined);

  // Background catalog updates (a server-list refresh, a projection re-run) give
  // Timeline a freshly-built `items` array on every change, so `assets` is a new
  // array reference even when it still names the same selection. Keying the
  // effect on the array itself would restart planning - and flash the dialog
  // back to its loading state - on every such background update. The asset ids
  // are what actually identifies "what is this dialog for".
  const assetIdsKey = assets.map(item => item.assetId).join(',');
  useEffect(() => {
    if (!open) return;
    diagnosticRunRef.current = action === 'delete' ? startDiagnosticRun(assets.length) : undefined;
    setPhase('planning');
    setFailureMessage(undefined);
    setPlans(undefined);
    setRows([]);
    setChosenServerName(undefined);
    setMirrorSupport({});
    setSyncGapCount(undefined);
    cancelledRef.current = false;
    failedRef.current = false;
    void Promise.all(
      assets.map(async item => {
        const result = await getCatalogClient().planCatalogAction(pubkey, item.assetId, action);
        return {
          item,
          allowed: result.allowed,
          reason: 'reason' in result ? result.reason : undefined,
          targets: result.targets,
        };
      })
    )
      .then(async result => {
        setPlans(result);
        if (diagnosticRunRef.current) {
          updateDiagnosticRun(diagnosticRunRef.current.id, { phase: 'loading-replica-maps' });
        }
        const allowed = result.filter(plan => plan.allowed);
        const maps = await Promise.all(
          allowed.map(plan => getCatalogClient().getAssetReplicaMap(pubkey, plan.item.assetId))
        );
        setReplicaMaps(maps);
        if (action === 'sync') setSyncGapCount(maps.flatMap(map => buildReplicaOps(map)).length);
        setPhase('reviewing');
        if (diagnosticRunRef.current) {
          updateDiagnosticRun(diagnosticRunRef.current.id, { phase: 'reviewing' });
        }
      })
      .catch(error => {
        if (diagnosticRunRef.current) {
          recordDiagnosticError('bulk-delete.planning', error);
          finishDiagnosticRun(diagnosticRunRef.current.id);
        }
        setFailureMessage(errorMessage(error));
        setPhase('failed');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- assetIdsKey stands in for `assets`
  }, [open, assetIdsKey, action, pubkey]);

  if (!open) return null;
  const allowedPlans = plans?.filter(plan => plan.allowed) ?? [];
  const blockedPlans = plans?.filter(plan => !plan.allowed) ?? [];
  const targetHashes = [...new Set(allowedPlans.flatMap(plan => plan.targets))];
  const eligibleServers = Object.values(serverInfo)
    .filter(server => mediaServer(server).capabilities.mirror && !server.virtual)
    .sort((a, b) => a.name.localeCompare(b.name));
  const destination = eligibleServers.find(server => server.name === chosenServerName);
  // Only blobs the destination is actually missing get transferred, so the preview
  // must count gaps rather than every blob of the asset.
  const mirrorGapCount = destination
    ? replicaMaps.flatMap(map => buildReplicaOps(map, normalizeServerUrl(destination.url))).length
    : undefined;
  const hostOf = (url: string) => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  };
  // The live per-server blob list (`serverInfo`) is a browser-side snapshot: it is
  // empty while a server's list request is loading, erroring, or simply not
  // configured right now. The catalog's replica map is the durable record - the
  // same one the server filter and the mirror/sync actions above already trust -
  // so delete targets come from there too, with the live list used only to pick a
  // display name and to update its cache after a successful delete.
  const liveServerByServerId = new Map(
    Object.values(serverInfo)
      .filter(server => !server.virtual)
      .map(server => [normalizeServerUrl(server.url), server] as const)
  );
  type DeleteTask = {
    hash: string;
    title: string;
    size?: number;
    serverId: string;
    baseUrl: string;
    serverType: CatalogServerType;
  };
  // Every (file, server) pair delete will actually touch - computed once up front so
  // the review screen, the button's disabled state, and the run itself all agree on
  // what "this" delete means, instead of the run rediscovering it from scratch.
  const deleteTasks: DeleteTask[] =
    action === 'delete'
      ? (() => {
          const byKey = new Map<string, DeleteTask>();
          allowedPlans.forEach((plan, index) => {
            for (const replica of replicaMaps[index] ?? []) {
              for (const source of replica.sources) {
                const key = `${replica.sha256}:${source.serverId}`;
                if (byKey.has(key)) continue;
                byKey.set(key, {
                  hash: replica.sha256,
                  title: plan.item.displayTitle,
                  size: replica.size,
                  serverId: source.serverId,
                  baseUrl: source.baseUrl,
                  serverType: source.serverType,
                });
              }
            }
          });
          return [...byKey.values()];
        })()
      : [];
  const deleteServerBreakdown =
    action === 'delete'
      ? Object.values(
          deleteTasks.reduce<Record<string, { serverName: string; count: number; size: number }>>((acc, task) => {
            const serverName = liveServerByServerId.get(task.serverId)?.name ?? hostOf(task.baseUrl);
            const entry = acc[task.serverId] ?? { serverName, count: 0, size: 0 };
            entry.count += 1;
            entry.size += task.size ?? 0;
            acc[task.serverId] = entry;
            return acc;
          }, {})
        ).sort((a, b) => a.serverName.localeCompare(b.serverName))
      : [];
  const hashesOnNoServer =
    action === 'delete' ? targetHashes.filter(hash => !deleteTasks.some(task => task.hash === hash)) : [];

  const updateRow = (key: string, update: Partial<Row>) => {
    if (update.state === 'error') failedRef.current = true;
    setRows(previous => previous.map(row => (row.key === key ? { ...row, ...update } : row)));
  };
  // Both blossom (HTTPError#status) and NIP-96 (axios) surface the same signal
  // differently. Either way, a 404 means the server already agrees with us -
  // that's success for our purposes, not a failure to report.
  const isNotFoundError = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') return false;
    if ('status' in error) return (error as { status?: number }).status === 404;
    if ('response' in error) return (error as { response?: { status?: number } }).response?.status === 404;
    return false;
  };

  const complete = (result?: { cancelled: boolean }) => {
    setPhase('complete');
    queryClient.invalidateQueries({ queryKey: ['blobs'] });
    // The caller clears the user's selection here. Doing that after a partial
    // failure or a cancelled run would take away the very items they need in
    // order to retry.
    if (!failedRef.current && !result?.cancelled) onDeleted();
  };
  const closeDialog = () => {
    if (diagnosticRunRef.current && phase !== 'running') finishDiagnosticRun(diagnosticRunRef.current.id);
    onClose();
  };
  const runDelete = () => {
    const rowKey = (hash: string, serverId: string) => `${hash}:${serverId}`;
    setRows(
      deleteTasks.map(task => {
        const serverName = liveServerByServerId.get(task.serverId)?.name ?? hostOf(task.baseUrl);
        return {
          key: rowKey(task.hash, task.serverId),
          label: `${task.title} — ${task.hash.slice(0, 12)} → ${serverName}`,
          state: 'pending' as const,
        };
      })
    );
    setPhase('running');
    const controller = new AbortController();
    deleteAbortRef.current = controller;
    const removed: BlobRemoval[] = [];
    const diagnosticRunId = diagnosticRunRef.current?.id;
    let completedCount = 0;
    let failedCount = 0;
    if (diagnosticRunId) {
      updateDiagnosticRun(diagnosticRunId, { phase: 'deleting', total: deleteTasks.length });
    }
    void runTasks(
      deleteTasks,
      async (task, index) => {
        const key = rowKey(task.hash, task.serverId);
        const live = liveServerByServerId.get(task.serverId);
        const dropFromLiveCache = () => {
          if (!live) return; // no live list loaded for this server - nothing to reconcile
          queryClient.setQueryData(['blobs', live.name], (old: BlobDescriptor[] | undefined) =>
            old ? old.filter(blob => blob.sha256 !== task.hash) : old
          );
        };
        updateRow(key, { state: 'running', message: undefined });
        let taskFailed = false;
        let lastError: string | undefined;
        try {
          await mediaServer(live ?? { type: task.serverType, name: hostOf(task.baseUrl), url: task.baseUrl }).delete(
            task.hash,
            signEventTemplate
          );
          dropFromLiveCache();
          removed.push({ sha256: task.hash, serverUrl: task.baseUrl });
          updateRow(key, { state: 'done' });
        } catch (error) {
          if (isNotFoundError(error)) {
            dropFromLiveCache();
            removed.push({ sha256: task.hash, serverUrl: task.baseUrl, reason: 'not found on server' });
            updateRow(key, { state: 'not_found', message: 'Already gone from this server.' });
          } else {
            taskFailed = true;
            failedCount += 1;
            lastError = errorMessage(error);
            updateRow(key, { state: 'error', message: lastError });
            // Re-throw so runTasks counts the task as failed and the run verdict
            // keeps the selection alive for a retry.
            throw error;
          }
        } finally {
          completedCount += 1;
          if (diagnosticRunId && (taskFailed || completedCount % 25 === 0 || completedCount === deleteTasks.length)) {
            updateDiagnosticRun(diagnosticRunId, {
              completed: completedCount,
              failed: failedCount,
              lastTask: index,
              lastServer: hostOf(task.baseUrl),
              lastError,
            });
          }
        }
      },
      { concurrency: CONCURRENCY, signal: controller.signal }
    )
      .then(async result => {
        if (diagnosticRunId) {
          updateDiagnosticRun(diagnosticRunId, {
            phase: 'updating-catalog',
            completed: completedCount,
            failed: failedCount,
          });
        }
        // Every server that confirmed the blob gone - deleted just now, or already a
        // 404 - stops counting as a replica immediately, instead of waiting for the
        // next probe to notice the file it just watched disappear.
        if (removed.length > 0) {
          await getCatalogClient().recordBlobsRemoved(pubkey, removed);
        }
        complete(result);
        if (diagnosticRunId) finishDiagnosticRun(diagnosticRunId);
      })
      .catch(error => {
        if (diagnosticRunId) {
          recordDiagnosticError('bulk-delete.catalog-update', error);
          finishDiagnosticRun(diagnosticRunId);
        }
        setFailureMessage(errorMessage(error));
        setPhase('failed');
      });
  };

  const runTransfer = async () => {
    let transfersRan = false;
    try {
      const destinationServerId = action === 'mirror' && destination ? normalizeServerUrl(destination.url) : undefined;
      const operationGroups = await Promise.all(
        allowedPlans.map(async plan =>
          (
            buildReplicaOps(
              await getCatalogClient().getAssetReplicaMap(pubkey, plan.item.assetId),
              destinationServerId
            ) as ReplicaOp[]
          ).map(op => ({ op, title: plan.item.displayTitle }))
        )
      );
      const labelled = operationGroups.flat();
      const ops = labelled.map(entry => entry.op);
      setRows(
        labelled.map(({ op, title }) => ({
          key: `${op.sha256}:${op.targetServerId}`,
          // Name the media being copied, not just the digest of one of its blobs.
          label: `${title} → ${op.targetBaseUrl}`,
          state: 'pending',
        }))
      );
      setPhase('running');
      transfersRan = true;
      const transferredHashes = new Set<string>();
      const controller = new AbortController();
      transferAbortRef.current = controller;
      const result = await runTasks(
        ops,
        async op => {
          const key = `${op.sha256}:${op.targetServerId}`;
          const target = Object.values(serverInfo).find(server => normalizeServerUrl(server.url) === op.targetServerId);
          if (!target) {
            const error = new Error('Destination server is no longer available.');
            updateRow(key, { state: 'error', message: error.message });
            failedRef.current = true;
            throw error;
          }
          updateRow(key, { state: 'running', message: undefined });
          try {
            const descriptor = await transferBlob(`${op.sourceBaseUrl}/${op.sha256}`, target, signEventTemplate, {
              signal: controller.signal,
              allowMirror: mirrorSupport[op.targetServerId] !== false,
              onMirrorUnsupported: () => setMirrorSupport(current => ({ ...current, [op.targetServerId]: false })),
              onPhaseChange: transferPhase => updateRow(key, { phase: transferPhase }),
              onProgress: event => updateRow(key, { loaded: event.loaded, total: event.total }),
            });
            await getCatalogClient().ingestUpload(pubkey, { url: target.url, type: target.type }, descriptor, true);
            transferredHashes.add(op.sha256);
            updateRow(key, { state: 'done', phase: 'completed' });
          } catch (error) {
            failedRef.current = true;
            updateRow(key, { state: 'error', message: errorMessage(error), phase: 'error' });
            throw error;
          }
        },
        { concurrency: TRANSFER_CONCURRENCY, signal: controller.signal }
      );
      transferAbortRef.current = undefined;
      // Blobs that made it across before a cancel are really there, so record them either
      // way. Without this the catalog keeps reporting them as missing on the destination.
      if (transferredHashes.size > 0) {
        await getCatalogClient().refreshReplicaAvailability(pubkey, probeReplica, 100, [...transferredHashes]);
      }
      complete(result);
    } catch (error) {
      setFailureMessage(
        transfersRan
          ? `Transfers completed, but the local catalog view may be stale until the next refresh: ${errorMessage(error)}`
          : errorMessage(error)
      );
      setPhase('failed');
    }
  };

  const done = rows.filter(row => row.state === 'done' || row.state === 'not_found' || row.state === 'error').length;
  const succeeded = rows.filter(row => row.state === 'done').length;
  const notFound = rows.filter(row => row.state === 'not_found').length;
  const failed = rows.filter(row => row.state === 'error').length;
  const progress = rows.length ? Math.round((done / rows.length) * 100) : 0;
  const reviewingCopy =
    action === 'delete'
      ? `${targetHashes.length} file${targetHashes.length === 1 ? '' : 's'} across ${allowedPlans.length} item${allowedPlans.length === 1 ? '' : 's'} will be deleted from ${deleteServerBreakdown.length} server${deleteServerBreakdown.length === 1 ? '' : 's'}. This cannot be undone.`
      : action === 'mirror'
        ? destination === undefined
          ? 'Choose a destination server to see what would be copied.'
          : mirrorGapCount === 0
            ? `${destination.name} already holds every file of the selected item${allowedPlans.length === 1 ? '' : 's'}. Nothing to copy.`
            : `${mirrorGapCount} file${mirrorGapCount === 1 ? '' : 's'} missing on ${destination.name} will be copied there.`
        : `${syncGapCount ?? 0} missing file cop${syncGapCount === 1 ? 'y' : 'ies'} will be filled in across your servers.`;

  return (
    <DialogPrimitive.Root open={open}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg"
          onInteractOutside={event => phase === 'running' && event.preventDefault()}
          onEscapeKeyDown={event => phase === 'running' && event.preventDefault()}
        >
          <DialogPrimitive.Title className="text-lg font-semibold">
            {ACTION_LABEL[action]} {assets.length === 1 ? '1 item' : `${assets.length} items`}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
            {phase === 'planning' && 'Computing what this action will affect…'}
            {phase === 'reviewing' && reviewingCopy}
            {phase === 'running' &&
              `${action === 'delete' ? 'Deleting' : 'Transferring'} ${action === 'delete' ? `up to ${CONCURRENCY}` : `up to ${TRANSFER_CONCURRENCY}`} files concurrently…`}
            {phase === 'complete' &&
              (action === 'delete'
                ? `${succeeded} deleted, ${notFound} already gone, ${failed} failed.`
                : `${succeeded} succeeded, ${failed} failed.`)}
            {phase === 'failed' && failureMessage}
          </DialogPrimitive.Description>
          {phase === 'planning' && (
            <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Planning…
            </div>
          )}
          {action === 'delete' && phase === 'reviewing' && (
            <p className="mt-3 border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {/* Deleting blobs does not touch the events that reference them, so
                  saying nothing here would leave the user with broken posts. */}
              This deletes the files from your media servers. The Nostr events that reference them stay on your relays,
              so any post using these files will show missing media.
            </p>
          )}
          {phase === 'failed' && (
            <div className="mt-6 flex items-start gap-2 rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="break-words">{failureMessage}</p>
            </div>
          )}
          {plans && phase === 'reviewing' && (
            <div className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {action === 'mirror' && (
                <ServerSelect
                  servers={eligibleServers}
                  selectedServer={chosenServerName}
                  onServerChange={setChosenServerName}
                  placeholder="Choose a destination server"
                />
              )}
              {action === 'delete' && deleteServerBreakdown.length > 0 && (
                <div className="space-y-1">
                  <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                    Servers affected ({deleteServerBreakdown.length})
                  </p>
                  {deleteServerBreakdown.map(server => (
                    <div
                      key={server.serverName}
                      className="flex items-center justify-between rounded border bg-muted/10 px-2 py-1.5 text-xs"
                    >
                      <span className="truncate font-medium">{server.serverName}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {server.count} file{server.count === 1 ? '' : 's'} · {formatFileSize(server.size)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {action === 'delete' && hashesOnNoServer.length > 0 && (
                <div className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <CircleSlash className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p>
                    {hashesOnNoServer.length} file{hashesOnNoServer.length === 1 ? '' : 's'} not found on any known
                    server already - nothing to delete there.
                  </p>
                </div>
              )}
              {blockedPlans.length > 0 && (
                <div className="space-y-1">
                  <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                    Blocked ({blockedPlans.length})
                  </p>
                  {blockedPlans.map(plan => (
                    <div
                      key={plan.item.assetId}
                      className="flex items-start gap-2 rounded border bg-muted/30 px-2 py-1.5 text-xs"
                    >
                      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{plan.item.displayTitle}</p>
                        <p className="text-muted-foreground">{plan.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {allowedPlans.length > 0 && (
                <div className="space-y-1">
                  <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                    Allowed ({allowedPlans.length})
                  </p>
                  {allowedPlans.map(plan => (
                    <div key={plan.item.assetId} className="rounded border bg-muted/10 px-2 py-1.5 text-xs">
                      <p className="truncate font-medium">{plan.item.displayTitle}</p>
                      <p className="text-muted-foreground">
                        {plan.targets.length === 1 ? '1 file' : `${plan.targets.length} files`}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {(phase === 'running' || phase === 'complete') && (
            <div className="mt-4 space-y-3">
              <div className="space-y-1.5">
                <Progress value={progress} className="h-2" />
                <p className="text-right text-xs tabular-nums text-muted-foreground">
                  {done} / {rows.length}
                </p>
              </div>
              <ul className="max-h-48 space-y-0.5 overflow-y-auto rounded-md border bg-muted/40 p-2">
                {rows.map(row => (
                  <li
                    key={row.key}
                    className={cn(
                      'rounded px-1.5 py-1 text-xs font-mono',
                      row.state === 'running' && 'bg-muted text-foreground',
                      row.state === 'done' && 'text-muted-foreground',
                      row.state === 'not_found' && 'text-amber-700 dark:text-amber-400',
                      row.state === 'error' && 'text-destructive'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="shrink-0">
                        {row.state === 'done' && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                        {row.state === 'not_found' && <CircleSlash className="h-3.5 w-3.5" />}
                        {row.state === 'error' && <XCircle className="h-3.5 w-3.5 text-destructive" />}
                        {row.state === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {row.state === 'pending' && <Trash2 className="h-3.5 w-3.5 opacity-30" />}
                      </span>
                      <span className="flex-1 truncate">{row.label}</span>
                    </div>
                    {row.state === 'running' && row.total && (
                      <p className="ml-5 text-muted-foreground">
                        {row.phase} {Math.round(((row.loaded ?? 0) / row.total) * 100)}%
                      </p>
                    )}
                    {row.message && (
                      <p className={cn('ml-5 break-words', row.state === 'error' ? 'text-destructive' : 'opacity-80')}>
                        {row.message}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-6 flex justify-end gap-2">
            {phase === 'reviewing' && (
              <>
                <Button variant="outline" size="sm" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button
                  variant={action === 'delete' ? 'destructive' : 'default'}
                  size="sm"
                  onClick={action === 'delete' ? runDelete : () => void runTransfer()}
                  disabled={
                    targetHashes.length === 0 ||
                    (action === 'mirror' && !destination) ||
                    (action === 'delete' && deleteTasks.length === 0)
                  }
                >
                  {ACTION_LABEL[action]} {targetHashes.length} file{targetHashes.length === 1 ? '' : 's'}
                </Button>
              </>
            )}
            {phase === 'running' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  transferAbortRef.current?.abort();
                  cancelledRef.current = true;
                  if (diagnosticRunRef.current) {
                    updateDiagnosticRun(diagnosticRunRef.current.id, { phase: 'cancelling' });
                  }
                  deleteAbortRef.current?.abort();
                  closeDialog();
                }}
              >
                Cancel
              </Button>
            )}
            {(phase === 'complete' || phase === 'failed') && (
              <Button size="sm" onClick={closeDialog}>
                Close
              </Button>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
