import React from 'react';
import { Server } from '../utils/useUserServers';
import { TransferStats } from './UploadFileSelection';
import { ServerIcon } from '@heroicons/react/24/outline';
import ProgressBar from './ProgressBar/ProgressBar';
import { formatFileSize } from '../utils/utils';

interface UploadProgressProps {
  servers: Server[];
  transfers: Record<string, TransferStats>;
}

const UploadProgress: React.FC<UploadProgressProps> = ({ servers, transfers }) => {
  return (
    <>
      <h3 className="text-lg">Servers</h3>
      <div className="cursor-pointer grid gap-2" style={{ gridTemplateColumns: '1.5em 20em auto' }}>
        {servers.map(
          s =>
            transfers[s.name]?.enabled && (
              <>
                <ServerIcon></ServerIcon> {s.name}
                <div className="flex flex-col gap-2">
                  <ProgressBar
                    value={transfers[s.name].transferred}
                    max={transfers[s.name].size}
                    description={transfers[s.name].rate > 0 ? '' + formatFileSize(transfers[s.name].rate) + '/s' : ''}
                  />
                  {transfers[s.name].error && <div className="alert alert-error">{transfers[s.name].error}</div>}
                </div>
              </>
            )
        )}
      </div>
    </>
  );
};

export default UploadProgress;
