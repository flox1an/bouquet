/**
 * The replica presence law (ADR-0006): who gets to say a blob is present or
 * absent on a server, and when the catalog may look again. Every writer of a
 * `blob_location` row goes through these three functions - the rule lives here
 * or nowhere.
 */

export type ReplicaState = 'present' | 'absent' | 'unauthorized' | 'rate_limited' | 'unreachable' | 'unknown';

/**
 * The one record shape for a blob-on-a-server location row. Both store writers
 * (server listings in catalog.ts, probes in advanced.ts) put rows in the same
 * `blob_location` store, so the shape - and the full ReplicaState it can carry -
 * is declared once, here, next to the law that governs it.
 */
export type BlobLocationSource = 'replica' | 'native-url' | 'server-list' | 'delete';
export type BlobLocation = {
  id: string;
  sha256: string;
  serverId: string;
  state: ReplicaState;
  firstPresentAt?: number;
  lastPresentAt?: number;
  lastCheckedAt: number;
  nextCheckAt: number;
  reportedSize?: number;
  reportedMimeType?: string;
  canonicalUrl: string;
  consecutiveFailures: number;
  source: BlobLocationSource;
};
export type BlobLocationHistory = {
  id: string;
  sha256: string;
  serverId: string;
  observedAt: number;
  previousState?: ReplicaState;
  newState: ReplicaState;
  httpStatus?: number;
  reason?: string;
  reportedSize?: number;
  reportedMimeType?: string;
};

export function stateFromHttpStatus(status: number): ReplicaState {
  if (status >= 200 && status < 300) return 'present';
  if (status === 404 || status === 410) return 'absent';
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 429) return 'rate_limited';
  return 'unreachable';
}

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

/** Present blobs are re-checked daily; absent ones back off exponentially, capped at a day. */
export function nextCheckAtFrom(observedAt: number, state: ReplicaState, consecutiveFailures: number): number {
  if (state === 'present') return observedAt + DAY;
  return observedAt + Math.min(HOUR * 2 ** consecutiveFailures, DAY);
}

/**
 * A full server listing claiming presence is authoritative - unless a probe
 * observed the blob absent: Primal keeps listing blobs it has already deleted,
 * so only a fresh probe may flip absence back.
 */
export function listingClaimMayRestore(previousState: string | undefined): boolean {
  return previousState !== 'absent';
}
