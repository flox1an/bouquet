import { useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Loader2, RotateCw } from 'lucide-react';
import type { EventTemplate, SignedEvent } from 'blossom-client-sdk';
import type { NostrEvent } from 'nostr-tools';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useNostr } from '../../utils/nostr';
import { useUserServers } from '../../utils/useUserServers';
import { mediaServer } from '../../utils/server';
import { REPORT_TYPES, buildReportTemplate, type ReportType } from '../../utils/report';
import { mergeRelays } from '@/nostr/core';
import { publishToRelays, retryFailedTargets, type PublishResult } from '../../utils/publish';

type ReportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Blob hashes to report (BUD-09: one or more x tags). */
  hashes: string[];
  /** Nostr event the blobs were found in, for e/p context tags. */
  event?: { id: string; pubkey?: string };
  signEventTemplate: (template: EventTemplate) => Promise<SignedEvent>;
};

type ServerOutcome = { ok: boolean; message?: string };

const relayStatusLabel = (result: PublishResult | undefined): string => {
  if (!result) return 'Pending';
  switch (result.verdict) {
    case 'delivered':
      return 'Delivered';
    case 'disabled':
      return 'Skipped (publishing disabled)';
    case 'partial':
      return `Partial (${result.targets.filter(t => t.ok).length}/${result.targets.length})`;
    default:
      return 'Failed';
  }
};

export function ReportDialog({ open, onOpenChange, hashes, event, signEventTemplate }: ReportDialogProps) {
  const { user } = useNostr();
  const { servers } = useUserServers();
  const [type, setType] = useState<ReportType>('other');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [signedEvent, setSignedEvent] = useState<NostrEvent>();
  const [relayResult, setRelayResult] = useState<PublishResult>();
  const [serverResults, setServerResults] = useState<Record<string, ServerOutcome>>({});
  const [signingError, setSigningError] = useState<string>();

  // Reports go to every enabled blossom server; NIP-96 has no /report endpoint.
  const reportServers = servers.filter(server => server.type === 'blossom');

  const failedServerNames = reportServers
    .map(server => server.name)
    .filter(name => serverResults[name] && !serverResults[name].ok);
  const relayFailed = relayResult ? relayResult.verdict === 'failed' || relayResult.verdict === 'partial' : false;
  const submitted = signedEvent !== undefined;
  const anyFailure = submitted && (relayFailed || failedServerNames.length > 0);

  const attempt = async (target: { relays: boolean; serverNames: string[] }) => {
    setSubmitting(true);
    setSigningError(undefined);
    try {
      let signed = signedEvent;
      if (!signed) {
        signed = (await signEventTemplate(
          buildReportTemplate({ hashes, type, content, event })
        )) as unknown as NostrEvent;
        setSignedEvent(signed);
      }

      let nextRelayResult = relayResult;
      if (target.relays) {
        nextRelayResult = relayResult
          ? await retryFailedTargets(relayResult)
          : await publishToRelays(mergeRelays(user?.relayUrls), signed);
        setRelayResult(nextRelayResult);
      }

      const nextServerResults = { ...serverResults };
      await Promise.all(
        target.serverNames.map(async name => {
          const server = reportServers.find(s => s.name === name);
          if (!server) return;
          try {
            await mediaServer(server).report(signed as never);
            nextServerResults[name] = { ok: true };
          } catch (error) {
            nextServerResults[name] = { ok: false, message: error instanceof Error ? error.message : String(error) };
          }
        })
      );
      setServerResults(nextServerResults);

      const relayOk =
        !nextRelayResult || nextRelayResult.verdict === 'delivered' || nextRelayResult.verdict === 'disabled';
      const serversOk = reportServers.every(server => nextServerResults[server.name]?.ok);
      if (relayOk && serversOk) onOpenChange(false);
    } catch (error) {
      setSigningError(error instanceof Error ? error.message : 'Signing failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg">
          <DialogPrimitive.Title className="text-lg font-bold">
            Report blob{hashes.length > 1 ? `s (${hashes.length})` : ''}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground">
            Sends a NIP-56 report event to your relays and to your blossom servers (BUD-09).
          </DialogPrimitive.Description>

          <RadioGroup
            value={type}
            onValueChange={value => setType(value as ReportType)}
            className="grid grid-cols-3 gap-2"
          >
            {REPORT_TYPES.map(reportType => (
              <Label key={reportType} className="flex cursor-pointer items-center gap-2 border p-2 font-normal">
                <RadioGroupItem value={reportType} />
                {reportType}
              </Label>
            ))}
          </RadioGroup>

          <Textarea
            placeholder="Details (optional, included in the public report event)"
            value={content}
            onChange={e => setContent(e.target.value)}
            disabled={submitted}
          />

          {submitted && (
            <div className="flex flex-col gap-2 border p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span>Relays</span>
                <span
                  className={
                    relayResult?.verdict === 'delivered'
                      ? 'text-green-600'
                      : relayResult?.verdict === 'disabled'
                        ? 'text-muted-foreground'
                        : 'text-destructive'
                  }
                >
                  {relayStatusLabel(relayResult)}
                </span>
              </div>
              {reportServers.map(server => (
                <div key={server.name} className="flex items-center justify-between gap-2">
                  <span>{server.name}</span>
                  <span
                    className={
                      serverResults[server.name] === undefined
                        ? 'text-muted-foreground'
                        : serverResults[server.name]!.ok
                          ? 'text-green-600'
                          : 'text-destructive'
                    }
                  >
                    {serverResults[server.name] === undefined
                      ? 'Pending'
                      : serverResults[server.name]!.ok
                        ? 'Delivered'
                        : (serverResults[server.name]!.message ?? 'Failed')}
                  </span>
                </div>
              ))}
            </div>
          )}
          {signingError && <p className="text-sm text-destructive">{signingError}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {anyFailure ? (
              <Button
                onClick={() => void attempt({ relays: relayFailed, serverNames: failedServerNames })}
                disabled={submitting}
              >
                {submitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RotateCw className="mr-1 h-4 w-4" />}
                Retry failed
              </Button>
            ) : (
              <Button
                onClick={() => void attempt({ relays: true, serverNames: reportServers.map(s => s.name) })}
                disabled={submitting}
              >
                {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Send report
              </Button>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
