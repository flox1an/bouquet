import { useRef, useState } from 'react';
import { Loader2, RotateCw } from 'lucide-react';
import type { NostrEvent } from 'nostr-tools';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import FileEventEditor, { type FileEventData } from '../FileEventEditor/FileEventEditor';
import { usePublishing } from '../FileEventEditor/usePublishing';
import { retryFailedTargets, type PublishResult } from '../../utils/publish';

type DescribeUnlinkedFileDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData: FileEventData;
  onPublished: (event: NostrEvent) => Promise<void>;
};

function accepted(result: PublishResult): boolean {
  return result.verdict === 'delivered' || (result.verdict === 'partial' && result.targets.some(target => target.ok));
}

function retryable(result: PublishResult | undefined): boolean {
  return result?.verdict === 'partial' || result?.verdict === 'failed';
}

function resultLabel(result: PublishResult): string {
  if (result.verdict === 'delivered') return 'Delivered';
  if (result.verdict === 'disabled') return 'Skipped (publishing disabled)';
  if (result.verdict === 'partial') return `Partial (${result.targets.filter(target => target.ok).length}/${result.targets.length} relays)`;
  return 'Failed';
}

export function DescribeUnlinkedFileDialog({
  open,
  onOpenChange,
  initialData,
  onPublished,
}: DescribeUnlinkedFileDialogProps) {
  const { publishFileEvent } = usePublishing();
  const [data, setData] = useState(initialData);
  const [result, setResult] = useState<PublishResult>();
  const [error, setError] = useState<string>();
  const [publishing, setPublishing] = useState(false);
  const ingestedEventId = useRef<string | undefined>(undefined);

  const recordAcceptedEvent = async (publishResult: PublishResult) => {
    if (!accepted(publishResult) || ingestedEventId.current === publishResult.event.id) return;
    await onPublished(publishResult.event);
    ingestedEventId.current = publishResult.event.id;
  };

  const publish = async () => {
    setPublishing(true);
    setError(undefined);
    try {
      const publishResult = await publishFileEvent(data);
      setResult(publishResult);
      await recordAcceptedEvent(publishResult);
      if (publishResult.verdict === 'delivered') onOpenChange(false);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Could not publish file metadata.');
    } finally {
      setPublishing(false);
    }
  };

  const retry = async () => {
    if (!result) return;
    setPublishing(true);
    setError(undefined);
    try {
      const publishResult = await retryFailedTargets(result);
      setResult(publishResult);
      await recordAcceptedEvent(publishResult);
      if (publishResult.verdict === 'delivered') onOpenChange(false);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Could not retry file metadata.');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Describe and publish file</DialogTitle>
          <DialogDescription>Review the catalog metadata, then publish a Nostr file metadata event.</DialogDescription>
        </DialogHeader>
        <FileEventEditor fileEventData={data} setFileEventData={setData} />
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {result && (
          <div className="space-y-1 rounded-lg border p-3 text-sm" role="status">
            <p>{resultLabel(result)}</p>
            {result.targets.filter(target => !target.ok).map(target => (
              <p key={target.url} className="text-destructive">{target.url}: {target.message ?? 'Rejected'}</p>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={publishing}>Cancel</Button>
          <Button onClick={retryable(result) ? retry : publish} disabled={publishing}>
            {publishing ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" />Publishing…</> : retryable(result) ? <><RotateCw className="mr-1 h-4 w-4" />Retry failed</> : 'Publish metadata'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
