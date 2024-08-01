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
import { BlobDescriptor } from 'blossom-client-sdk';
import { useNDK } from '../utils/ndk';
import { useQueryClient } from '@tanstack/react-query';
import { formatFileSize } from '../utils/utils';
import BlobList from '../components/BlobList/BlobList';
import './Transfer.css';
import { useNavigate, useParams } from 'react-router-dom';
import ProgressBar from '../components/ProgressBar/ProgressBar';
import { transferBlob } from '../utils/transfer';

type TransferStatus = {
  [key: string]: {
    sha256: string;
    status: 'pending' | 'done' | 'error';
    message?: string;
    size: number;
    uploaded?: number;
    rate?: number;
    downloaded?: number; // Bytes downloaded
  };
};

export const Transfer = () => {
  // TODO add transfer for single files
  // TODO add support for mirror command (fallback to upload)

  const { source } = useParams();
  const [transferSource, setTransferSource] = useState(source);
  const navigate = useNavigate();
  const { serverInfo } = useServerInfo();
  const [transferTarget, setTransferTarget] = useState<string | undefined>();
  const { signEventTemplate } = useNDK();
  const queryClient = useQueryClient();
  const [started, setStarted] = useState(false);
  const [transferCancelled, setTransferCancelled] = useState(false);

  const [transferLog, setTransferLog] = useState<TransferStatus>({});

  const closeTransferMode = () => {
    queryClient.invalidateQueries({ queryKey: ['blobs', transferTarget] });
    setTransferTarget(undefined);
    setTransferLog({});
    setStarted(false);
    navigate('/browse');
  };

  const transferJobs = useMemo(() => {
    if (transferSource && transferTarget) {
      const sourceBlobs = serverInfo[transferSource].blobs;
      const targetBlobs = serverInfo[transferTarget].blobs;
      return sourceBlobs?.filter(src => targetBlobs?.find(tgt => tgt.sha256 == src.sha256) == undefined);
    }
    return [];
  }, [serverInfo, transferSource, transferTarget]);

  const performTransfer = async (sourceServer: string, targetServer: string, blobs: BlobDescriptor[]) => {
    setTransferLog({});
    setTransferCancelled(false);
    setStarted(true);
    for (const b of blobs) {
      if (transferCancelled) break;
      try {
        setTransferLog(ts => ({
          ...ts,
          [b.sha256]: {
            sha256: b.sha256,
            status: 'pending',
            size: b.size,
            uploaded: 0,
            rate: 0,
            downloaded: 0,
          },
        }));

        await transferBlob(
          `${serverInfo[sourceServer].url}/${b.sha256}`,
          serverInfo[targetServer],
          signEventTemplate,
          progressEvent => {
            setTransferLog(ts => ({
              ...ts,
              [b.sha256]: {
                ...ts[b.sha256],
                uploaded: progressEvent.loaded,
                downloaded: progressEvent.loaded,
                rate: progressEvent.rate || 0,
              },
            }));
          }
        );

        setTransferLog(ts => ({
          ...ts,
          [b.sha256]: {
            ...ts[b.sha256],
            rate: 0,
            uploaded: ts[b.sha256].size,
            downloaded: ts[b.sha256].size,
            status: 'done',
          },
        }));
      } catch (e: any) {
        if (e.response?.status === 404) {
          setTransferLog(ts => ({
            ...ts,
            [b.sha256]: {
              sha256: b.sha256,
              status: 'error',
              message: 'Blob not found (404)',
              size: b.size,
              downloaded: 0,
              uploaded: 0,
            },
          }));
          return null;
        }
        throw e;
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
        acc.downloaded += t.downloaded || 0;
        acc.uploaded += t.uploaded || 0;
        return acc;
      },
      { pending: 0, done: 0, error: 0, size: 0, downloaded: 0, uploaded: 0 }
    );
    return { ...stats, fullSize: transferJobs?.reduce((acc, b) => acc + b.size, 0) || 0 };
  }, [transferLog, transferJobs]);

  const transferErrors = useMemo(() => Object.values(transferLog).filter(b => b.status == 'error'), [transferLog]);

  const currentTransferStep = 0;
  const transferSteps = (
    <ul className="steps pt-8 pb-4 md:p-8">
      <li className={`step ${currentTransferStep >= 0 ? 'step-primary' : ''}`}>Choose source</li>
      <li className={`step ${currentTransferStep >= 1 ? 'step-primary' : ''}`}>Choose target</li>
      <li className={`step ${currentTransferStep >= 2 ? 'step-primary' : ''}`}>Sync blobs</li>
    </ul>
  );

  return transferSource ? (
    <div className="flex flex-col mx-auto max-w-[80em] w-full">
      {transferSteps}
      <ServerList
        selectedServer={transferSource}
        servers={Object.values(serverInfo)
          .filter(s => s.type == 'blossom')
          .filter(s => s.name == transferSource)}
        onCancel={() => closeTransferMode()}
        title={
          <>
            <ArrowUpOnSquareIcon /> Sync Source
          </>
        }
      ></ServerList>
      <ServerList
        servers={Object.values(serverInfo)
          .filter(s => s.type == 'blossom')
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
                value={transferStatus.downloaded}
                max={transferStatus.fullSize}
                description={
                  formatFileSize(transferStatus.downloaded) +
                  ' / ' +
                  formatFileSize(transferStatus.fullSize) +
                  ' downloaded'
                }
              />

              <ProgressBar
                value={transferStatus.uploaded}
                max={transferStatus.fullSize}
                description={
                  formatFileSize(transferStatus.uploaded) +
                  ' / ' +
                  formatFileSize(transferStatus.fullSize) +
                  ' uploaded'
                }
              />

              {<div className="message"></div>}
              {transferErrors.length > 0 && (
                <>
                  <h2>Errors</h2>
                  <div className="error-log">
                    {transferErrors.map(t => (
                      <div key={t.sha256}>
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
                </>
              )}
            </div>
            <button className="btn btn-primary" onClick={() => setTransferCancelled(true)}>
              Cancel transfer
            </button>
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
    </div>
  ) : (
    <div className="flex flex-col mx-auto max-w-[80em] w-full">
      {transferSteps}
      <ServerList
        title={
          <>
            <ArrowUpOnSquareIcon /> Sync Source
          </>
        }
        servers={Object.values(serverInfo).sort()}
        selectedServer={transferSource}
        setSelectedServer={s => setTransferSource(s)}
      ></ServerList>
    </div>
  );
};
