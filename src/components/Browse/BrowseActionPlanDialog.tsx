import { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { BlobDescriptor, EventTemplate, SignedEvent } from 'blossom-client-sdk';
import { createDeleteAuth } from 'blossom-client-sdk/auth';
import { deleteBlob as deleteBlobFromServer } from 'blossom-client-sdk/actions/delete';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, ShieldAlert, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { getCatalog, normalizeServerUrl } from '../../catalog/catalog';
import {
  buildReplicaOps,
  getAssetReplicaMap,
  planCatalogAction,
  projectCatalogAssets,
  refreshReplicaAvailability,
  type AssetReplica,
  type CatalogAction,
  type ReplicaOp,
} from '../../catalog/advanced';
import { probeReplica } from '../../catalog/availabilityFetch';
import { transferBlob, type TransferPhase } from '../../utils/transfer';
import { deleteNip96File } from '../../utils/nip96';
import type { ServerInfo } from '../../utils/useServerInfo';
import { ServerSelect } from '../ServerList/ServerSelect';
import type { TimelineItem } from './browseConstants';

const CONCURRENCY = 5;
const TRANSFER_CONCURRENCY = 2;
type RowState = 'pending' | 'running' | 'done' | 'error';
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
  distribution: Record<string, { servers: string[] }>;
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
  distribution,
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
  const failedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
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
        const result = await planCatalogAction(getCatalog(), pubkey, item.assetId, action);
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
        const allowed = result.filter(plan => plan.allowed);
        const maps = await Promise.all(
          allowed.map(plan => getAssetReplicaMap(getCatalog(), pubkey, plan.item.assetId))
        );
        setReplicaMaps(maps);
        if (action === 'sync') setSyncGapCount(maps.flatMap(map => buildReplicaOps(map)).length);
        setPhase('reviewing');
      })
      .catch(error => {
        setFailureMessage(errorMessage(error));
        setPhase('failed');
      });
  }, [open, assets, action, pubkey]);

  if (!open) return null;
  const allowedPlans = plans?.filter(plan => plan.allowed) ?? [];
  const blockedPlans = plans?.filter(plan => !plan.allowed) ?? [];
  const targetHashes = [...new Set(allowedPlans.flatMap(plan => plan.targets))];
  const eligibleServers = Object.values(serverInfo)
    .filter(server => server.type === 'blossom' && !server.virtual)
    .sort((a, b) => a.name.localeCompare(b.name));
  const destination = eligibleServers.find(server => server.name === chosenServerName);
  // Only blobs the destination is actually missing get transferred, so the preview
  // must count gaps rather than every blob of the asset.
  const mirrorGapCount = destination
    ? replicaMaps.flatMap(map => buildReplicaOps(map, normalizeServerUrl(destination.url))).length
    : undefined;

  const updateRow = (key: string, update: Partial<Row>) => {
    if (update.state === 'error') failedRef.current = true;
    setRows(previous => previous.map(row => (row.key === key ? { ...row, ...update } : row)));
  };
  const deleteHashFromAllServers = async (hash: string) => {
    const targets = (distribution[hash]?.servers ?? [])
      .map(name => serverInfo[name])
      .filter((server): server is ServerInfo => !!server && !server.virtual);
    if (!targets.length) throw new Error('No server currently reports this blob.');
    const results = await Promise.allSettled(
      targets.map(async server => {
        if (server.type === 'blossom') {
          const auth = await createDeleteAuth(signEventTemplate, hash);
          await deleteBlobFromServer(server.url, hash, { auth });
        } else await deleteNip96File(server, hash, signEventTemplate);
        queryClient.setQueryData(['blobs', server.name], (old: BlobDescriptor[] | undefined) =>
          old ? old.filter(blob => blob.sha256 !== hash) : old
        );
      })
    );
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length)
      throw new Error(
        `Failed on ${failures.length}/${targets.length} server(s): ${errorMessage((failures[0] as PromiseRejectedResult).reason)}`
      );
  };

  const complete = () => {
    setPhase('complete');
    queryClient.invalidateQueries({ queryKey: ['blobs'] });
    // The caller clears the user's selection here. Doing that after a partial
    // failure would take away the very items they need in order to retry.
    if (!failedRef.current) onDeleted();
  };
  const runDelete = () => {
    // A confirmation that lists 64-character hashes does not tell anyone what they
    // are about to destroy. Name the media, and keep the hash for identification.
    const titleForHash = new Map<string, string>();
    for (const plan of allowedPlans) {
      for (const hash of plan.targets) {
        if (!titleForHash.has(hash)) titleForHash.set(hash, plan.item.displayTitle);
      }
    }
    const initial = targetHashes.map(hash => {
      const title = titleForHash.get(hash);
      return {
        key: hash,
        label: title ? `${title} — ${hash.slice(0, 12)}` : hash,
        state: 'pending' as const,
      };
    });
    setRows(initial);
    setPhase('running');
    let nextIndex = 0;
    const worker = async () => {
      while (true) {
        if (cancelledRef.current) return;
        const i = nextIndex++;
        if (i >= targetHashes.length) return;
        const hash = targetHashes[i];
        updateRow(hash, { state: 'running', message: undefined });
        try {
          await deleteHashFromAllServers(hash);
          updateRow(hash, { state: 'done' });
        } catch (error) {
          updateRow(hash, { state: 'error', message: errorMessage(error) });
        }
      }
    };
    void Promise.all(Array.from({ length: CONCURRENCY }, worker))
      .then(complete)
      .catch(error => {
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
              await getAssetReplicaMap(getCatalog(), pubkey, plan.item.assetId),
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
      let nextIndex = 0;
      const transferredHashes = new Set<string>();
      const worker = async () => {
        while (true) {
          if (cancelledRef.current) return;
          const i = nextIndex++;
          if (i >= ops.length) return;
          const op = ops[i];
          const key = `${op.sha256}:${op.targetServerId}`;
          const target = Object.values(serverInfo).find(server => normalizeServerUrl(server.url) === op.targetServerId);
          if (!target) {
            updateRow(key, { state: 'error', message: 'Destination server is no longer available.' });
            continue;
          }
          updateRow(key, { state: 'running', message: undefined });
          try {
            const descriptor = await transferBlob(`${op.sourceBaseUrl}/${op.sha256}`, target, signEventTemplate, {
              allowMirror: mirrorSupport[op.targetServerId] !== false,
              onMirrorUnsupported: () => setMirrorSupport(current => ({ ...current, [op.targetServerId]: false })),
              onPhaseChange: transferPhase => updateRow(key, { phase: transferPhase }),
              onProgress: event => updateRow(key, { loaded: event.loaded, total: event.total }),
            });
            await getCatalog().ingestUpload(pubkey, { url: target.url, type: target.type }, descriptor, true);
            transferredHashes.add(op.sha256);
            updateRow(key, { state: 'done', phase: 'completed' });
          } catch (error) {
            updateRow(key, { state: 'error', message: errorMessage(error), phase: 'error' });
          }
        }
      };
      await Promise.all(Array.from({ length: TRANSFER_CONCURRENCY }, worker));
      // Blobs that made it across before a cancel are really there, so record them either
      // way. Without this the catalog keeps reporting them as missing on the destination.
      if (transferredHashes.size > 0) {
        await refreshReplicaAvailability(getCatalog(), pubkey, probeReplica, 100, [...transferredHashes]);
        await projectCatalogAssets(getCatalog(), pubkey, { force: true });
      }
      if (!cancelledRef.current) complete();
    } catch (error) {
      setFailureMessage(
        transfersRan
          ? `Transfers completed, but the local catalog view may be stale until the next refresh: ${errorMessage(error)}`
          : errorMessage(error)
      );
      setPhase('failed');
    }
  };

  const done = rows.filter(row => row.state === 'done' || row.state === 'error').length;
  const succeeded = rows.filter(row => row.state === 'done').length;
  const failed = rows.filter(row => row.state === 'error').length;
  const progress = rows.length ? Math.round((done / rows.length) * 100) : 0;
  const reviewingCopy =
    action === 'delete'
      ? `${targetHashes.length} blob${targetHashes.length === 1 ? '' : 's'} across ${allowedPlans.length} asset${allowedPlans.length === 1 ? '' : 's'} will be deleted from every server that reports them.`
      : action === 'mirror'
        ? destination === undefined
          ? 'Choose a destination server to see what would be copied.'
          : mirrorGapCount === 0
            ? `${destination.name} already holds every blob of the selected asset${allowedPlans.length === 1 ? '' : 's'}. Nothing to copy.`
            : `${mirrorGapCount} blob${mirrorGapCount === 1 ? '' : 's'} missing on ${destination.name} will be copied there.`
        : `${syncGapCount ?? 0} blob/server gap${syncGapCount === 1 ? '' : 's'} will be synced for the allowed assets.`;

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
            {ACTION_LABEL[action]} {assets.length} asset{assets.length === 1 ? '' : 's'}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
            {phase === 'planning' && 'Computing what this action will affect…'}
            {phase === 'reviewing' && reviewingCopy}
            {phase === 'running' &&
              `${action === 'delete' ? 'Deleting' : 'Transferring'} ${action === 'delete' ? `up to ${CONCURRENCY}` : `up to ${TRANSFER_CONCURRENCY}`} blobs concurrently…`}
            {phase === 'complete' && `${succeeded} succeeded, ${failed} failed.`}
            {phase === 'failed' && failureMessage}
          </DialogPrimitive.Description>
          {phase === 'planning' && (
            <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Planning…
            </div>
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
                        {plan.targets.length} blob{plan.targets.length === 1 ? '' : 's'}
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
                      row.state === 'error' && 'text-destructive'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="shrink-0">
                        {row.state === 'done' && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
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
                    {row.message && <p className="ml-5 break-words text-destructive">{row.message}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-6 flex justify-end gap-2">
            {phase === 'reviewing' && (
              <>
                <Button variant="outline" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  variant={action === 'delete' ? 'destructive' : 'default'}
                  size="sm"
                  onClick={action === 'delete' ? runDelete : () => void runTransfer()}
                  disabled={targetHashes.length === 0 || (action === 'mirror' && !destination)}
                >
                  {ACTION_LABEL[action]} {targetHashes.length} blob{targetHashes.length === 1 ? '' : 's'}
                </Button>
              </>
            )}
            {phase === 'running' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  cancelledRef.current = true;
                  onClose();
                }}
              >
                Cancel
              </Button>
            )}
            {(phase === 'complete' || phase === 'failed') && (
              <Button size="sm" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
