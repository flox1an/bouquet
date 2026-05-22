import { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { BlobDescriptor } from 'blossom-client-sdk';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Loader2, Trash2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const CONCURRENCY = 5;

type FileState = 'pending' | 'deleting' | 'done' | 'error' | 'cancelled';

type Props = {
  open: boolean;
  blobs: BlobDescriptor[];
  onDeleteOne: (blob: BlobDescriptor) => Promise<void>;
  onClose: () => void;
};

const DeleteProgressDialog = ({ open, blobs, onDeleteOne, onClose }: Props) => {
  const [fileStates, setFileStates] = useState<FileState[]>([]);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!open || blobs.length === 0) return;

    cancelledRef.current = false;
    setFileStates(blobs.map(() => 'pending'));

    // Shared index counter — safe in JS single-threaded event loop
    let nextIndex = 0;

    const worker = async () => {
      while (true) {
        if (cancelledRef.current) break;

        const i = nextIndex++;
        if (i >= blobs.length) break;

        setFileStates(prev => prev.map((s, idx) => (idx === i ? 'deleting' : s)));

        try {
          await onDeleteOne(blobs[i]);
          setFileStates(prev => prev.map((s, idx) => (idx === i ? 'done' : s)));
        } catch {
          setFileStates(prev => prev.map((s, idx) => (idx === i ? 'error' : s)));
        }
      }
    };

    Promise.all(Array.from({ length: CONCURRENCY }, worker)).then(() => {
      if (cancelledRef.current) {
        setFileStates(prev => prev.map(s => (s === 'pending' ? 'cancelled' : s)));
      } else {
        setTimeout(() => onClose(), 600);
      }
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleCancel = () => {
    cancelledRef.current = true;
    onClose();
  };

  const done = fileStates.filter(s => s === 'done').length;
  const total = blobs.length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  const isComplete = done === total && total > 0;

  return (
    <DialogPrimitive.Root open={open}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
          onInteractOutside={e => e.preventDefault()}
          onEscapeKeyDown={e => e.preventDefault()}
        >
          <DialogPrimitive.Title className="text-lg font-semibold">
            {isComplete ? 'Deletion complete' : `Deleting ${total} file${total !== 1 ? 's' : ''}`}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
            {isComplete
              ? `${done} file${done !== 1 ? 's' : ''} deleted successfully.`
              : `Deleting up to ${CONCURRENCY} files concurrently…`}
          </DialogPrimitive.Description>

          <div className="mt-5 space-y-1.5">
            <Progress value={progress} className="h-2" />
            <p className="text-right text-xs tabular-nums text-muted-foreground">
              {done} / {total}
            </p>
          </div>

          <ul className="mt-4 max-h-52 overflow-y-auto rounded-md border bg-muted/40 p-2 space-y-0.5">
            {blobs.map((blob, i) => {
              const state: FileState = fileStates[i] ?? 'pending';
              const label = blob.sha256 ? blob.sha256.slice(0, 24) : blob.url.slice(-24);
              const ext = blob.type?.split('/')[1] ?? '';
              return (
                <li
                  key={blob.sha256 || blob.url}
                  className={cn(
                    'flex items-center gap-2 rounded px-1.5 py-1 text-xs font-mono transition-colors',
                    state === 'deleting' && 'bg-muted text-foreground',
                    state === 'done' && 'text-muted-foreground',
                    state === 'error' && 'text-destructive',
                    state === 'cancelled' && 'text-muted-foreground opacity-50 line-through',
                    state === 'pending' && 'text-muted-foreground/60'
                  )}
                >
                  <span className="shrink-0">
                    {state === 'done' && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
                    {state === 'error' && <XCircle className="h-3.5 w-3.5 text-destructive" />}
                    {state === 'deleting' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {(state === 'pending' || state === 'cancelled') && (
                      <Trash2 className="h-3.5 w-3.5 opacity-30" />
                    )}
                  </span>
                  <span className="flex-1 truncate">{label}</span>
                  {ext && <span className="ml-auto text-muted-foreground/60">{ext}</span>}
                </li>
              );
            })}
          </ul>

          <div className="mt-6 flex justify-end">
            <Button variant="outline" size="sm" onClick={handleCancel} disabled={isComplete}>
              Cancel
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default DeleteProgressDialog;
