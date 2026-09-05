import type { BlobDescriptor } from 'blossom-client-sdk';
import { runTasks, type RunResult } from '../utils/run';
import { MediaServerError, type MediaServer } from '../utils/server';
import { buildReplicaOps, type ReplicaOp, type ReplicaProbe } from './advanced';
import type { AssetReplica, BlobRemoval, CatalogAction, CatalogServerType } from './catalog';
export type ActionRunPlan = {
  action: CatalogAction;
  allowed: { assetId: string; title: string; targets: string[] }[];
  blocked: { assetId: string; title: string; reason: string }[];
  targetHashes: string[];
  /** delete: every (hash, server) pair the run will touch - what review, button and run all agree on. */
  deleteTasks: DeleteTask[];
  /** mirror (with destination) or sync: the replica gaps to fill. Empty for delete. */
  ops: ReplicaOp[];
};

export type DeleteTask = {
  hash: string;
  serverId: string;
  baseUrl: string;
  serverType: CatalogServerType;
  size?: number;
};
export type SignEventTemplate = Parameters<Pick<MediaServer, 'delete'>['delete']>[1];
export type ActionCatalog = {
  planCatalogAction(
    pubkey: string,
    assetId: string,
    action: CatalogAction
  ): Promise<{ allowed: boolean; reason?: string; targets: string[] }>;
  getAssetReplicaMap(pubkey: string, assetId: string): Promise<AssetReplica[]>;
  recordBlobsRemoved(pubkey: string, removals: BlobRemoval[]): Promise<void>;
  ingestUpload(
    pubkey: string,
    server: { url: string; type: CatalogServerType },
    descriptor: BlobDescriptor,
    overwrite?: boolean
  ): Promise<unknown>;
  refreshReplicaAvailability(
    pubkey: string,
    probe: ReplicaProbe,
    maxChecks?: number,
    hashes?: string[]
  ): Promise<unknown>;
};

export async function planActionRun(
  catalog: ActionCatalog,
  args: {
    pubkey: string;
    action: CatalogAction;
    assets: { assetId: string; title: string }[];
    destinationUrl?: string;
  }
): Promise<ActionRunPlan> {
  const plans = await Promise.all(
    args.assets.map(async asset => {
      const result = await catalog.planCatalogAction(args.pubkey, asset.assetId, args.action);
      return {
        assetId: asset.assetId,
        title: asset.title,
        allowed: result.allowed,
        reason: 'reason' in result ? result.reason : undefined,
        targets: result.targets,
      };
    })
  );
  const allowed = plans
    .filter(plan => plan.allowed)
    .map(({ assetId, title, targets }) => ({ assetId, title, targets }));
  const blocked = plans
    .filter(plan => !plan.allowed)
    .map(({ assetId, title, reason }) => ({ assetId, title, reason: reason ?? '' }));

  const replicaMaps = await Promise.all(allowed.map(plan => catalog.getAssetReplicaMap(args.pubkey, plan.assetId)));
  const destinationServerId = args.destinationUrl; // callers pass an already-normalized id

  const ops = replicaMaps.flatMap(map => buildReplicaOps(map, destinationServerId) as ReplicaOp[]);

  const byKey = new Map<string, DeleteTask>();
  allowed.forEach((_plan, index) => {
    for (const replica of replicaMaps[index]) {
      for (const source of replica.sources) {
        const key = `${replica.sha256}:${source.serverId}`;
        if (byKey.has(key)) continue;
        byKey.set(key, {
          hash: replica.sha256,
          serverId: source.serverId,
          baseUrl: source.baseUrl,
          serverType: source.serverType,
          size: replica.size,
        });
      }
    }
  });

  return {
    action: args.action,
    allowed,
    blocked,
    targetHashes: [...new Set(allowed.flatMap(plan => plan.targets))],
    deleteTasks: args.action === 'delete' ? [...byKey.values()] : [],
    ops: args.action === 'delete' ? [] : ops,
  };
}

/** Bounded like the dialog ran it: a worker-serialised catalog sits behind these deletes. */
const CONCURRENCY = 5;

export type RunRowState = 'pending' | 'running' | 'done' | 'not_found' | 'error';
export type RunRow = {
  key: string;
  sha256: string;
  serverId: string;
  state: RunRowState;
  message?: string;
};

export type DeleteRunResult = {
  allSucceeded: boolean;
  cancelled: boolean;
  removed: BlobRemoval[];
};

/**
 * A server already agreeing the blob is gone (not-found) is success for this run,
 * not a failure - same semantics the dialog used to encode inline.
 */
export async function executeDeleteRun(
  plan: ActionRunPlan,
  deps: {
    catalog: ActionCatalog;
    pubkey: string;
    mediaServerFor: (task: DeleteTask) => Pick<MediaServer, 'delete'>;
    signEventTemplate?: SignEventTemplate;
    onRow?: (row: RunRow) => void;
    signal?: AbortSignal;
  }
): Promise<DeleteRunResult> {
  const removed: BlobRemoval[] = [];
  const emit = (task: DeleteTask, state: RunRowState, message?: string) =>
    deps.onRow?.({ key: `${task.hash}:${task.serverId}`, sha256: task.hash, serverId: task.serverId, state, message });

  const result: RunResult<void> = await runTasks(
    plan.deleteTasks,
    async task => {
      emit(task, 'running');
      try {
        await deps.mediaServerFor(task).delete(task.hash, deps.signEventTemplate!);
        removed.push({ sha256: task.hash, serverUrl: task.serverId });
        emit(task, 'done');
      } catch (error) {
        if (error instanceof MediaServerError && error.kind === 'not-found') {
          removed.push({ sha256: task.hash, serverUrl: task.serverId, reason: 'not found on server' });
          emit(task, 'not_found', 'Already gone from this server.');
        } else {
          emit(task, 'error', error instanceof Error ? error.message : 'Unknown error');
          throw error;
        }
      }
    },
    { concurrency: CONCURRENCY, signal: deps.signal }
  );

  // Every confirmed removal stops counting as a replica immediately, instead of
  // waiting for the next probe to notice the file disappear.
  if (removed.length > 0) {
    await deps.catalog.recordBlobsRemoved(deps.pubkey, removed);
  }
  return { allSucceeded: result.allSucceeded, cancelled: result.cancelled, removed };
}

const TRANSFER_CONCURRENCY = 2;

export type TransferRunResult = {
  allSucceeded: boolean;
  cancelled: boolean;
  transferredHashes: string[];
};

/**
 * The catalog records each blob that actually landed - including ones that made it
 * across before a cancel - so a partial run never leaves the catalog reporting the
 * destination as missing what it truly holds.
 */
export async function executeTransferRun(
  plan: ActionRunPlan,
  deps: {
    pubkey: string;
    transfer: (op: ReplicaOp) => Promise<BlobDescriptor>;
    serverFor: (op: ReplicaOp) => { url: string; type: CatalogServerType };
    probe: ReplicaProbe;
    catalog: ActionCatalog;
    onRow?: (row: RunRow) => void;
    signal?: AbortSignal;
  }
): Promise<TransferRunResult> {
  const transferredHashes = new Set<string>();
  const emit = (op: ReplicaOp, state: RunRowState, message?: string) =>
    deps.onRow?.({
      key: `${op.sha256}:${op.targetServerId}`,
      sha256: op.sha256,
      serverId: op.targetServerId,
      state,
      message,
    });

  const result: RunResult<void> = await runTasks(
    plan.ops,
    async op => {
      emit(op, 'running');
      try {
        const descriptor = await deps.transfer(op);
        await deps.catalog.ingestUpload(deps.pubkey, deps.serverFor(op), descriptor, true);
        transferredHashes.add(op.sha256);
        emit(op, 'done');
      } catch (error) {
        emit(op, 'error', error instanceof Error ? error.message : 'Unknown error');
        throw error;
      }
    },
    { concurrency: TRANSFER_CONCURRENCY, signal: deps.signal }
  );

  if (transferredHashes.size > 0) {
    await deps.catalog.refreshReplicaAvailability(deps.pubkey, deps.probe, 100, [...transferredHashes]);
  }
  return {
    allSucceeded: result.allSucceeded,
    cancelled: result.cancelled,
    transferredHashes: [...transferredHashes],
  };
}
