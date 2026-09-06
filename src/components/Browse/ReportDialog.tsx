import { useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Loader2 } from 'lucide-react';
import type { EventTemplate, SignedEvent } from 'blossom-client-sdk';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { useNostr } from '../../utils/nostr';
import { useUserServers } from '../../utils/useUserServers';
import { mediaServer } from '../../utils/server';
import { REPORT_TYPES, buildReportTemplate, type ReportType } from '../../utils/report';
import { relayPool, mergeRelays } from '@/nostr/core';
import { useToast } from '../../hooks/use-toast';

type ReportDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Blob hashes to report (BUD-09: one or more x tags). */
  hashes: string[];
  /** Nostr event the blobs were found in, for e/p context tags. */
  event?: { id: string; pubkey?: string };
  signEventTemplate: (template: EventTemplate) => Promise<SignedEvent>;
};

export function ReportDialog({ open, onOpenChange, hashes, event, signEventTemplate }: ReportDialogProps) {
  const { user } = useNostr();
  const { servers } = useUserServers();
  const { toast } = useToast();
  const [type, setType] = useState<ReportType>('other');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reports go to every enabled blossom server; NIP-96 has no /report endpoint.
  const reportServers = servers.filter(server => server.type === 'blossom');

  const submit = async () => {
    setSubmitting(true);
    try {
      const signed = await signEventTemplate(buildReportTemplate({ hashes, type, content, event }));

      // Spec-recommended merge: one event to relays AND to each blossom server.
      // Partial failures never block the rest.
      const results = await Promise.allSettled([
        relayPool.publish(mergeRelays(user?.relayUrls), signed as never),
        ...reportServers.map(server => mediaServer(server).report(signed as never)),
      ]);

      const failed = results.filter(r => r.status === 'rejected').length;
      const destinations = 1 + reportServers.length;
      if (failed === 0) toast({ title: 'Report sent', description: `Delivered to relays and ${reportServers.length} server(s).` });
      else if (failed < destinations) toast({ title: 'Report partially sent', description: `${destinations - failed}/${destinations} destinations accepted it.` });
      else toast({ title: 'Report failed', description: 'No destination accepted the report.', variant: 'destructive' });
      onOpenChange(false);
    } catch (error) {
      toast({ title: 'Report failed', description: error instanceof Error ? error.message : 'Signing failed', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg">
          <DialogPrimitive.Title className="text-lg font-bold">Report blob{hashes.length > 1 ? `s (${hashes.length})` : ''}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="text-sm text-muted-foreground">
            Sends a NIP-56 report event to your relays and to your blossom servers (BUD-09).
          </DialogPrimitive.Description>

          <RadioGroup value={type} onValueChange={value => setType(value as ReportType)} className="grid grid-cols-3 gap-2">
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
          />

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={submitting}>
              {submitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Send report
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
