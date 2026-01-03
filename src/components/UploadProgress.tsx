import React from 'react';
import { Server } from '../utils/useUserServers';
import { TransferStats } from './UploadFileSelection';
import { Cog, Server as ServerIcon, Loader2 } from 'lucide-react';
import ProgressBar from './ProgressBar/ProgressBar';
import { formatFileSize } from '../utils/utils';

interface UploadProgressProps {
  servers: Server[];
  transfers: Record<string, TransferStats>;
  preparing: boolean;
}

const UploadProgress: React.FC<UploadProgressProps> = ({ servers, transfers, preparing }) => {
  return (
    <>
      <h3 className="text-lg font-semibold">Servers</h3>
      {preparing && (
        <div className="py-2 flex items-center gap-2 text-muted-foreground">
          <Cog className="h-5 w-5 animate-spin" />
          <span>Preparing files...</span>
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      )}

      <div className="space-y-3 mt-2">
        {servers.map(
          s =>
            transfers[s.name]?.enabled && (
              <div key={s.name} className="flex items-center gap-3">
                <ServerIcon className="h-5 w-5 text-muted-foreground shrink-0" />
                <span className="w-48 truncate">{s.name}</span>
                <div className="flex-1 flex flex-col gap-1">
                  <ProgressBar
                    value={transfers[s.name].transferred}
                    max={transfers[s.name].size}
                    description={transfers[s.name].rate > 0 ? formatFileSize(transfers[s.name].rate) + '/s' : ''}
                  />
                  {transfers[s.name].error && (
                    <div className="text-sm text-destructive">{transfers[s.name].error}</div>
                  )}
                </div>
              </div>
            )
        )}
      </div>
    </>
  );
};

export default UploadProgress;
