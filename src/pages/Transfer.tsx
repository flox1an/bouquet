import {
  ArrowDownOnSquareIcon,
  ArrowUpOnSquareIcon,
  CheckBadgeIcon,
  DocumentIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { ServerList } from '../components/ServerList/ServerList';
import { useServerInfo } from '../utils/useServerInfo';
import { useMemo, useState } from 'react';
import { BlobDescriptor, BlossomClient } from 'blossom-client-sdk';
import { useNDK } from '../ndk';
import { useQueryClient } from '@tanstack/react-query';
import { formatFileSize } from '../utils';
import BlobList from '../components/BlobList/BlobList';
import './Transfer.css';
import { useNavigate, useParams } from 'react-router-dom';
import ProgressBar from '../components/ProgressBar/ProgressBar';

type TransferStatus = {
  [key: string]: {
    sha256: string;
    status: 'pending' | 'done' | 'error';
    message?: string;
    size: number;
  };
};

export const Transfer = () => {
  const { source: transferSource } = useParams();
  const navigate = useNavigate();
  const { serverInfo } = useServerInfo();
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
    navigate('/');
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
        acc.size += t.status == 'done' ? t.size : 0;
        return acc;
      },
      { pending: 0, done: 0, error: 0, size: 0 }
    );
    return { ...stats, fullSize: transferJobs?.reduce((acc, b) => acc + b.size, 0) || 0 };
  }, [transferLog, transferJobs]);

  return (
    transferSource && (
      <>
        <ServerList
          servers={Object.values(serverInfo).filter(s => s.name == transferSource)}
          onCancel={() => closeTransferMode()}
          title={
            <>
              <ArrowUpOnSquareIcon /> Transfer Source
            </>
          }
        ></ServerList>
        <ServerList
          servers={Object.values(serverInfo)
            .filter(s => s.name != transferSource)
            .sort()}
          selectedServer={transferTarget}
          setSelectedServer={setTransferTarget}
          title={
            <>
              <ArrowDownOnSquareIcon /> Transfer Target
            </>
          }
        ></ServerList>
        {transferTarget && transferJobs && transferJobs.length > 0 ? (
          <>
            <div className=" bg-base-200 rounded-xl p-4 text-neutral-content gap-4 flex flex-col my-4">
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
              <div className="w-5/6">
                <ProgressBar
                  value={transferStatus.size}
                  max={transferStatus.fullSize}
                  description={
                    formatFileSize(transferStatus.size) +
                    ' / ' +
                    formatFileSize(transferStatus.fullSize) +
                    ' transferred'
                  }
                />
                {<div className="message"></div>}
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
                        <span>{t.status && (t.status == 'error' ? <ExclamationTriangleIcon /> : '')}</span>
                        <span>{t.message}</span>
                      </div>
                    ))}
                </div>
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
    )
  );
};
