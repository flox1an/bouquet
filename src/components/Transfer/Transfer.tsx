import { ArrowDownOnSquareIcon, ArrowUpOnSquareIcon, CheckBadgeIcon, DocumentIcon } from '@heroicons/react/24/outline';
import { ServerList } from '../ServerList/ServerList';
import { useServerInfo } from '../../utils/useServerInfo';
import { useMemo, useState } from 'react';
import { BlobDescriptor, BlossomClient } from 'blossom-client-sdk';
import { useNDK } from '../../ndk';
import { useQueryClient } from '@tanstack/react-query';
import { formatFileSize } from '../../utils';
import BlobList from '../BlobList/BlobList';
import './Transfer.css';

type TransferStatus = {
  [key: string]: {
    sha256: string;
    status: 'pending' | 'done' | 'error';
    message?: string;
    size: number;
  };
};

export const Transfer = ({ transferSource, onCancel }: { transferSource: string; onCancel?: () => void }) => {
  const serverInfo = useServerInfo();
  const [transferTarget, setTransferTarget] = useState<string | undefined>();
  const { signEventTemplate } = useNDK();
  const queryClient = useQueryClient();
  const [started, setStarted] = useState(false);

  const [transferLog, setTransferLog] = useState<TransferStatus>({});

  const closeTransferMode = () => {
    queryClient.invalidateQueries({ queryKey: ['blobs', transferTarget] });
    setTransferTarget(undefined);
    setTransferLog({});
    setStarted(false);
    onCancel && onCancel();
  };

  const transferJobs = useMemo(() => {
    if (transferSource && transferTarget) {
      const sourceBlobs = serverInfo[transferSource].blobs;
      const targetBlobs = serverInfo[transferTarget].blobs;
      return sourceBlobs?.filter(src => targetBlobs?.find(tgt => tgt.sha256 == src.sha256) == undefined);
    }
    return [];
  }, [serverInfo, transferSource, transferTarget]);
  // https://github.com/sindresorhus/p-limit
  //
  const performTransfer = async (sourceServer: string, targetServer: string, blobs: BlobDescriptor[]) => {
    setTransferLog({});
    setStarted(true);
    for (const b of blobs) {
      try {
        // BlossomClient.getGetAuth()
        setTransferLog(ts => ({ ...ts, [b.sha256]: { sha256: b.sha256, status: 'pending', size: b.size } }));

        const data = await BlossomClient.getBlob(serverInfo[sourceServer].url, b.sha256);
        const file = new File([data], b.sha256, { type: b.type, lastModified: b.created });
        const uploadAuth = await BlossomClient.getUploadAuth(file, signEventTemplate, 'Upload Blob');
        await BlossomClient.uploadBlob(serverInfo[targetServer].url, file, uploadAuth);
        setTransferLog(ts => ({ ...ts, [b.sha256]: { sha256: b.sha256, status: 'done', size: b.size } }));
      } catch (e) {
        setTransferLog(ts => ({
          ...ts,
          [b.sha256]: { sha256: b.sha256, status: 'error', message: (e as Error).message, size: blobs.length },
        }));
        console.warn(e);
      }
    }

    // if (Object.values(transferLog).filter(b => b.status == 'error').length == 0) {
    //   closeTransferMode();
    // }
  };

  const transferStatus = useMemo(() => {
    const stats = Object.values(transferLog).reduce(
      (acc, t) => {
        if (t.status === 'done') {
          acc.done += 1;
        } else if (t.status === 'error') {
          acc.error += 1;
        } else {
          acc.pending += 1;
        }
        acc.size += t.size;
        return acc;
      },
      { pending: 0, done: 0, error: 0, size: 0 }
    );
    return { ...stats, fullSize: transferJobs?.reduce((acc, b) => acc + b.size, 0) || 0 };
  }, [transferLog, transferJobs]);

  return (
    <>
      <h2>
        <ArrowUpOnSquareIcon /> Transfer Source
      </h2>
      <ServerList
        servers={Object.values(serverInfo).filter(s => s.name == transferSource)}
        onCancel={() => closeTransferMode()}
      ></ServerList>
      <h2>
        <ArrowDownOnSquareIcon /> Transfer Target
      </h2>
      <ServerList
        servers={Object.values(serverInfo)
          .filter(s => s.name != transferSource)
          .sort()}
        selectedServer={transferTarget}
        setSelectedServer={setTransferTarget}
      ></ServerList>
      {transferTarget && transferJobs && transferJobs.length > 0 ? (
        <>
          <div className="message">
            {transferJobs.length} object{transferJobs.length > 1 ? 's' : ''} to transfer{' '}
            {!started && (
              <button
                className="action-button"
                onClick={() => performTransfer(transferSource, transferTarget, transferJobs)}
              >
                <ArrowUpOnSquareIcon />
                Start
              </button>
            )}
          </div>
          <div>
            <div className="w-full bg-gray-200 rounded-lg dark:bg-neutral-800">
              <div
                className="bg-pink-600 text-sm font-medium text-pink-100 text-center p-1 leading-none rounded-lg"
                style={{ width: `${Math.floor((transferStatus.size * 100) / transferStatus.fullSize)}%` }}
              >
                {Math.floor((transferStatus.size * 100) / transferStatus.fullSize)}&nbsp;%
              </div>
            </div>
            {
              <div className="message">
                {formatFileSize(transferStatus.size)} / {formatFileSize(transferStatus.fullSize)} transfered.
              </div>
            }
            <div className="error-log">
              {Object.values(transferLog)
                .filter(b => b.status == 'error')
                .map(t => (
                  <div>
                    <span>
                      <DocumentIcon />
                    </span>
                    <span>{t.sha256}</span>
                    <span>{formatFileSize(t.size)}</span>
                    <span>{t.status && `${t.status}`}</span>
                    <span>{t.message}</span>
                  </div>
                ))}
            </div>
          </div>
          {!started && <BlobList blobs={transferJobs}></BlobList>}
        </>
      ) : (
        <div className="message">
          {transferTarget ? (
            <>
              <CheckBadgeIcon /> no missing objects to transfer
            </>
          ) : (
            <>choose a transfer target above</>
          )}
        </div>
      )}
    </>
  );
};
