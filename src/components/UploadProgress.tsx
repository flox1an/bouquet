import React from 'react';
import { Server } from '../utils/useUserServers';
import { TransferStats } from './UploadFileSelection';
import { Server as ServerIcon, Loader2, RotateCw, X } from 'lucide-react';
import ProgressBar from './ProgressBar/ProgressBar';
import { formatFileSize } from '../utils/utils';
import { Button } from '@/components/ui/button';

interface UploadProgressProps {
  servers: Server[];
  transfers: Record<string, TransferStats>;
  preparing: boolean;
  uploadBusy?: boolean;
  filesDone: number;
  filesTotal: number;
  cancelled: boolean;
  onRetry?: () => void;
  onCancel: () => void;
  onBack: () => void;
  failedCount?: number;
}
const UploadProgress: React.FC<UploadProgressProps> = ({
  servers,
  transfers,
  preparing,
  uploadBusy,
  filesDone,
  filesTotal,
  cancelled,
  onRetry,
  onCancel,
  onBack,
  failedCount,
}) => {
  const active = servers.map(s => transfers[s.name]).filter(t => t?.enabled);
  const size = active.reduce((sum, t) => sum + t.size, 0);
  const percent = size > 0 ? Math.round((100 * active.reduce((sum, t) => sum + t.transferred, 0)) / size) : 0;

  return (
    <>
      <h3 className="text-lg font-semibold">Servers</h3>
      {preparing ? (
        <div className="py-2 flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>Preparing files…</span>
        </div>
      ) : (
        <div className="text-sm text-foreground" aria-live="polite">
          {filesDone} of {filesTotal} {filesTotal === 1 ? 'file' : 'files'} uploaded ({percent}%)
          {cancelled && ' · Upload cancelled'}
        </div>
      )}

      <div className="space-y-3 mt-2">
        {servers.map(
          s =>
            transfers[s.name]?.enabled && (
              <div key={s.name} className="flex items-center gap-3">
                <ServerIcon className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden="true" />
                <span className="w-48 truncate">{s.name}</span>
                <div className="flex-1 flex flex-col gap-1">
                  <ProgressBar
                    value={transfers[s.name].transferred}
                    max={transfers[s.name].size}
                    description={transfers[s.name].rate > 0 ? formatFileSize(transfers[s.name].rate) + '/s' : ''}
                  />
                  {transfers[s.name].error && <div className="text-sm text-destructive">{transfers[s.name].error}</div>}
                </div>
              </div>
            )
        )}
      </div>
      <div className="flex justify-end gap-2 pt-3">
        {uploadBusy ? (
          <Button onClick={onCancel} variant="secondary">
            <X className="w-4 h-4 mr-1" aria-hidden="true" />
            Cancel
          </Button>
        ) : (
          (failedCount ?? 0) > 0 && (
            <>
              <Button onClick={onBack} variant="secondary">
                Back
              </Button>
              {onRetry && (
                <Button onClick={onRetry} variant="default">
                  <RotateCw className="w-4 h-4 mr-1" aria-hidden="true" />
                  Retry failed uploads
                </Button>
              )}
            </>
          )
        )}
      </div>
    </>
  );
};

export default UploadProgress;
