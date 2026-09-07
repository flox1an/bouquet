import type { NostrEvent } from 'nostr-tools';
import { ReadonlyAccount } from 'applesauce-accounts/accounts';
import { relayPool } from '../nostr/core';
import { accountManager } from './nostr';

/**
 * The one path every Nostr relay publish crosses (issue #9). Before this module,
 * the file/audio/video publishing hook, the DVM thumbnail request, and the
 * server-list save each signed and called `relayPool.publish` directly - only one
 * of them honoured `VITE_DISABLE_EVENT_PUBLISH`, each re-implemented the read-only
 * account guard, and every one of them discarded the per-relay result. All three
 * (plus reporting) now funnel through `publishToRelays`/`signAndPublish`.
 */

export type PublishTarget = { url: string; ok: boolean; message?: string };
export type PublishVerdict = 'disabled' | 'delivered' | 'partial' | 'failed';
export type PublishResult = { event: NostrEvent; verdict: PublishVerdict; targets: PublishTarget[] };

export class ReadOnlyAccountError extends Error {
  constructor() {
    super('No signer available for the active account');
    this.name = 'ReadOnlyAccountError';
  }
}

function verdictFor(targets: PublishTarget[]): PublishVerdict {
  if (targets.length === 0) return 'failed';
  if (targets.every(target => target.ok)) return 'delivered';
  if (targets.some(target => target.ok)) return 'partial';
  return 'failed';
}

/** Publish an already-signed event to exactly the given relays - no merging, no
    invented destinations, so a retry can pass just the relays that failed last time. */
export async function publishToRelays(relays: string[], event: NostrEvent): Promise<PublishResult> {
  if (import.meta.env.VITE_DISABLE_EVENT_PUBLISH) {
    return { event, verdict: 'disabled', targets: [] };
  }
  const responses = await relayPool.publish(relays, event);
  const targets = responses.map(response => ({ url: response.from, ok: response.ok, message: response.message }));
  return { event, verdict: verdictFor(targets), targets };
}

/** Sign with the active account - the one read-only guard - then publish through
    the same shared path. */
export async function signAndPublish(
  template: Omit<NostrEvent, 'id' | 'sig'>,
  relays: string[]
): Promise<PublishResult> {
  const activeAccount = accountManager.active;
  if (!activeAccount || activeAccount instanceof ReadonlyAccount) throw new ReadOnlyAccountError();
  const event = await activeAccount.signer.signEvent(template);
  return publishToRelays(relays, event);
}

/** Replace only the retried destinations' targets, keeping every earlier result
    (already accepted, or not yet retried) untouched. */
export function mergePublishResults(previous: PublishResult, retry: PublishResult): PublishResult {
  const retriedUrls = new Set(retry.targets.map(target => target.url));
  const targets = [...previous.targets.filter(target => !retriedUrls.has(target.url)), ...retry.targets];
  return { event: previous.event, verdict: verdictFor(targets), targets };
}

/** The retry every caller should use (issue #25): re-signing would produce a
    different event id, so this dispatches the same already-signed event to only
    the destinations that failed last time, then folds the outcome back in. */
export async function retryFailedTargets(previous: PublishResult): Promise<PublishResult> {
  const failedUrls = previous.targets.filter(target => !target.ok).map(target => target.url);
  if (failedUrls.length === 0) return previous;
  const retry = await publishToRelays(failedUrls, previous.event);
  return mergePublishResults(previous, retry);
}
