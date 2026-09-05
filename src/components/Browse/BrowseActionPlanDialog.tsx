import { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { BlobDescriptor } from 'blossom-client-sdk';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleSlash, Loader2, ShieldAlert, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { formatFileSize } from '../../utils/utils';
import { normalizeServerUrl } from '../../catalog/catalog';
import { getCatalogClient } from '../../catalog/catalogClient';
import {
  executeDeleteRun,
  executeTransferRun,
  planActionRun,
  type ActionRunPlan,
  type DeleteTask,
  type RunRowState,
  type SignEventTemplate,
} from '../../catalog/runAction';
import { mediaServer } from '../../utils/server';
import { probeReplica } from '../../catalog/availabilityFetch';
import { transferBlob, type TransferPhase } from '../../utils/transfer';
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

type Row = {
  key: string;
  label: string;
  state: RunRowState;
  message?: string;
  phase?: string;
  loaded?: number;
  total?: number;
};

type BrowseActionPlanDialogProps = {
  open: boolean;
  action: 'mirror' | 'sync' | 'delete';
  assets: TimelineItem[];
  pubkey: string;
  serverInfo: { [name: string]: ServerInfo };
  signEventTemplate: SignEventTemplate;
  onClose: () => void;
  onDeleted: () => void;
};

const ACTION_LABEL: Record<'mirror' | 'sync' | 'delete', string> = { mirror: 'Mirror', sync: 'Sync', delete: 'Delete' };
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
  const [plan, setPlan] = useState<ActionRunPlan>();
  const [phase, setPhase] = useState<'planning' | 'reviewing' | 'running' | 'complete' | 'failed'>('planning');
  const [failureMessage, setFailureMessage] = useState<string>();
  const [rows, setRows] = useState<Row[]>([]);
  const [chosenServerName, setChosenServerName] = useState<string>();
  const [mirrorSupport, setMirrorSupport] = useState<Record<string, boolean>>({});
  const deleteAbortRef = useRef<AbortController | undefined>(undefined);
  const transferAbortRef = useRef<AbortController | undefined>(undefined);
  const diagnosticRunRef = useRef<DiagnosticRun | undefined>(undefined);

  // Background catalog updates (a server-list refresh, a projection re-run) give
  // Timeline a freshly-built `items` array on every change, so `assets` is a new
  // array reference even when it still names the same selection. Keying the
  // effect on the array itself would restart planning - and flash the dialog
  // back to its loading state - on every such background update. The asset ids
  // are what actually identifies "what is this dialog for".
  const assetIdsKey = assets.map(item => item.assetId).join(',');
  const eligibleServers = Object.values(serverInfo)
    .filter(server => mediaServer(server).capabilities.mirror && !server.virtual)
    .sort((a, b) => a.name.localeCompare(b.name));
  const destination = eligibleServers.find(server => server.name === chosenServerName);
  const destinationServerId = action === 'mirror' && destination ? normalizeServerUrl(destination.url) : undefined;

  useEffect(() => {
    if (!open) return;
    diagnosticRunRef.current = action === 'delete' ? startDiagnosticRun(assets.length) : undefined;
    setPhase('planning');
    setFailureMessage(undefined);
    setPlan(undefined);
    setRows([]);
    setChosenServerName(undefined);
    setMirrorSupport({});
    void planActionRun(getCatalogClient(), {
      pubkey,
      action,
      assets: assets.map(item => ({ assetId: item.assetId, title: item.displayTitle })),
      destinationUrl: destinationServerId,
    })
      .then(result => {
        setPlan(result);
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
  }, [open, assetIdsKey, action, pubkey, destinationServerId]);

  if (!open) return null;
  const allowedPlans = plan?.allowed ?? [];
  const blockedPlans = plan?.blocked ?? [];
  const deleteTasks: DeleteTask[] = action === 'delete' ? (plan?.deleteTasks ?? []) : [];
  const targetHashes = plan?.targetHashes ?? [];
  const hostOf = (url: string) => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  };
  const titleByHash = new Map(allowedPlans.flatMap(p => p.targets.map(hash => [hash, p.title] as const)));
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
  const serverNameFor = (task: DeleteTask) => liveServerByServerId.get(task.serverId)?.name ?? hostOf(task.baseUrl);
  const deleteServerBreakdown = Object.values(
    deleteTasks.reduce<Record<string, { serverName: string; count: number; size: number }>>((acc, task) => {
      const serverName = serverNameFor(task);
      const entry = acc[task.serverId] ?? { serverName, count: 0, size: 0 };
      entry.count += 1;
      entry.size += task.size ?? 0;
      acc[task.serverId] = entry;
      return acc;
    }, {})
  ).sort((a, b) => a.serverName.localeCompare(b.serverName));
  const hashesOnNoServer = targetHashes.filter(hash => !deleteTasks.some(task => task.hash === hash));
  const gapCount =
    action === 'sync' ? (plan?.ops.length ?? 0) : action === 'mirror' ? (plan?.ops.length ?? 0) : undefined;

  const updateRow = (key: string, update: Partial<Row>) =>
    setRows(previous => previous.map(row => (row.key === key ? { ...row, ...update } : row)));

  const complete = (result: { cancelled: boolean; allSucceeded: boolean }) => {
    setPhase('complete');
    queryClient.invalidateQueries({ queryKey: ['blobs'] });
    // The caller clears the user's selection here. Doing that after a partial
    // failure or a cancelled run would take away the very items they need in
    // order to retry.
    if (result.allSucceeded && !result.cancelled) onDeleted();
  };
  const closeDialog = () => {
    if (diagnosticRunRef.current && phase !== 'running') finishDiagnosticRun(diagnosticRunRef.current.id);
    onClose();
  };

  const runDelete = () => {
    if (!plan) return;
    setRows(
      plan.deleteTasks.map(task => ({
        key: `${task.hash}:${task.serverId}`,
        label: `${titleByHash.get(task.hash) ?? task.hash.slice(0, 12)} — ${task.hash.slice(0, 12)} → ${serverNameFor(task)}`,
        state: 'pending' as const,
      }))
    );
    setPhase('running');
    const controller = new AbortController();
    deleteAbortRef.current = controller;
    const diagnosticRunId = diagnosticRunRef.current?.id;
    let completedCount = 0;
    let failedCount = 0;
    if (diagnosticRunId) {
      updateDiagnosticRun(diagnosticRunId, { phase: 'deleting', total: plan.deleteTasks.length });
    }
    void executeDeleteRun(plan, {
      catalog: getCatalogClient(),
      pubkey,
      mediaServerFor: task =>
        mediaServer(
          liveServerByServerId.get(task.serverId) ?? {
            type: task.serverType,
            name: hostOf(task.baseUrl),
            url: task.baseUrl,
          }
        ),
      signEventTemplate,
      signal: controller.signal,
      onRow: row => {
        updateRow(row.key, { state: row.state, message: row.message });
        if (row.state === 'done' || row.state === 'not_found') {
          // The server just confirmed the blob gone - drop it from the live list
          // cache immediately instead of waiting for the next refetch.
          const live = liveServerByServerId.get(row.serverId);
          if (live) {
            queryClient.setQueryData(['blobs', live.name], (old: BlobDescriptor[] | undefined) =>
              old ? old.filter(blob => blob.sha256 !== row.sha256) : old
            );
          }
        }
        completedCount += 1;
        if (row.state === 'error') failedCount += 1;
        if (
          diagnosticRunId &&
          (row.state === 'error' || completedCount % 25 === 0 || completedCount === plan.deleteTasks.length)
        ) {
          updateDiagnosticRun(diagnosticRunId, {
            completed: completedCount,
            failed: failedCount,
            lastTask: completedCount,
          });
        }
      },
    })
      .then(result => {
        if (diagnosticRunId) {
          updateDiagnosticRun(diagnosticRunId, {
            phase: 'updating-catalog',
            completed: completedCount,
            failed: failedCount,
          });
          finishDiagnosticRun(diagnosticRunId);
        }
        complete(result);
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

  const runTransfer = () => {
    if (!plan) return;
    const titleByTargetKey = new Map(allowedPlans.flatMap(p => p.targets.map(hash => [hash, p.title] as const)));
    const targetServerFor = (serverId: string) =>
      Object.values(serverInfo).find(server => normalizeServerUrl(server.url) === serverId);
    setRows(
      plan.ops.map(op => ({
        key: `${op.sha256}:${op.targetServerId}`,
        // Name the media being copied, not just the digest of one of its blobs.
        label: `${titleByTargetKey.get(op.sha256) ?? op.sha256.slice(0, 12)} → ${op.targetBaseUrl}`,
        state: 'pending' as const,
      }))
    );
    setPhase('running');
    const controller = new AbortController();
    transferAbortRef.current = controller;
    void executeTransferRun(plan, {
      catalog: getCatalogClient(),
      pubkey,
      probe: probeReplica,
      signal: controller.signal,
      serverFor: op => {
        const target = targetServerFor(op.targetServerId);
        if (!target) throw new Error('Destination server is no longer available.');
        return { url: target.url, type: target.type };
      },
      transfer: op => {
        const target = targetServerFor(op.targetServerId);
        if (!target) throw new Error('Destination server is no longer available.');
        return transferBlob(`${op.sourceBaseUrl}/${op.sha256}`, target, signEventTemplate, {
          signal: controller.signal,
          allowMirror: mirrorSupport[op.targetServerId] !== false,
          onMirrorUnsupported: () => setMirrorSupport(current => ({ ...current, [op.targetServerId]: false })),
          onPhaseChange: (transferPhase: TransferPhase) =>
            updateRow(`${op.sha256}:${op.targetServerId}`, { phase: transferPhase }),
          onProgress: event =>
            updateRow(`${op.sha256}:${op.targetServerId}`, { loaded: event.loaded, total: event.total }),
        });
      },
      onRow: row =>
        updateRow(row.key, {
          state: row.state,
          message: row.message,
          phase: row.state === 'done' ? 'completed' : undefined,
        }),
    })
      .then(result => {
        transferAbortRef.current = undefined;
        complete(result);
      })
      .catch(error => {
        setFailureMessage(errorMessage(error));
        setPhase('failed');
      });
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
          : gapCount === 0
            ? `${destination.name} already holds every file of the selected item${allowedPlans.length === 1 ? '' : 's'}. Nothing to copy.`
            : `${gapCount} file${gapCount === 1 ? '' : 's'} missing on ${destination.name} will be copied there.`
        : `${gapCount ?? 0} missing file cop${gapCount === 1 ? 'y' : 'ies'} will be filled in across your servers.`;

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
          {plan && phase === 'reviewing' && (
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
                  {blockedPlans.map(blocked => (
                    <div
                      key={blocked.assetId}
                      className="flex items-start gap-2 rounded border bg-muted/30 px-2 py-1.5 text-xs"
                    >
                      <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{blocked.title}</p>
                        <p className="text-muted-foreground">{blocked.reason}</p>
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
                  {allowedPlans.map(allowed => (
                    <div key={allowed.assetId} className="rounded border bg-muted/10 px-2 py-1.5 text-xs">
                      <p className="truncate font-medium">{allowed.title}</p>
                      <p className="text-muted-foreground">
                        {allowed.targets.length === 1 ? '1 file' : `${allowed.targets.length} files`}
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
                    {row.state === 'running' && row.total != null && (
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
                  onClick={action === 'delete' ? runDelete : runTransfer}
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
                  deleteAbortRef.current?.abort();
                  if (diagnosticRunRef.current) {
                    updateDiagnosticRun(diagnosticRunRef.current.id, { phase: 'cancelling' });
                  }
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
