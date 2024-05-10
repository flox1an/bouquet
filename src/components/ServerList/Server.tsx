import {
  ArrowUpOnSquareStackIcon,
  CheckBadgeIcon,
  ClockIcon,
  CubeIcon,
  DocumentDuplicateIcon,
  ExclamationTriangleIcon,
  ServerIcon,
  ShieldExclamationIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { Server as ServerType } from '../../utils/useUserServers';
import { ServerInfo } from '../../utils/useServerInfo';
import { formatDate, formatFileSize } from '../../utils/utils';

type ServerProps = {
  server: ServerType;
  serverInfo: ServerInfo;
  selectedServer?: string | undefined;
  setSelectedServer?: React.Dispatch<React.SetStateAction<string | undefined>>;
  onTransfer?: (server: string) => void;
  onCancel?: () => void;
  onCheck?: (server: string) => void;
  blobsOnlyOnThisServer: number;
};

const Server = ({
  server,
  selectedServer,
  setSelectedServer,
  serverInfo,
  onTransfer,
  onCancel,
  onCheck,
  blobsOnlyOnThisServer,
}: ServerProps) => {
  const readyToUse = !serverInfo.isLoading && !serverInfo.isError;
  return (
    <div
      className={
        `server ${selectedServer == server.name ? 'selected' : ''} ` +
        `${readyToUse && setSelectedServer ? ' hover:bg-base-200 cursor-pointer' : ''}  `
      }
      key={server.name}
      onClick={() => readyToUse && setSelectedServer && setSelectedServer(server.name)}
    >
      <div className="server-icon">
        <ServerIcon />
      </div>
      <div className="flex flex-col grow">
        <div className="server-name">
          {server.name}
          {serverInfo.isLoading && <span className="ml-2 loading loading-spinner loading-sm"></span>}
        </div>
        {serverInfo.isError ? (
          <div className="badge badge-error">
            <ExclamationTriangleIcon className="w-4 mr-2" /> Error connecting to server
          </div>
        ) : (
          <div className="server-stats">
            <div className="server-stat tooltip text-left" data-tip="Number of blobs">
              <DocumentDuplicateIcon /> {serverInfo.count}
            </div>
            <div className="server-stat tooltip text-left" data-tip="Total size of blobs">
              <CubeIcon /> {formatFileSize(serverInfo.size)}
            </div>
            <div className="server-stat tooltip text-left" data-tip="Date of last change">
              <ClockIcon /> {formatDate(serverInfo.lastChange)}
            </div>
            {serverInfo.count > 0 && (
              <div className="server-stat">
                {blobsOnlyOnThisServer > 0 ? (
                  <div>
                    <ExclamationTriangleIcon /> {blobsOnlyOnThisServer} objects only available here
                  </div>
                ) : (
                  <div>
                    <CheckBadgeIcon /> all objects distributed.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {((selectedServer == server.name && onTransfer) || onCancel) && (
        <div className="server-actions ">
          {selectedServer == server.name && (
            <>
              {onCheck && (
                <a onClick={() => onCheck(server.name)}>
                  <ShieldExclamationIcon /> Check
                </a>
              )}
              {onTransfer && (
                <a onClick={() => onTransfer(server.name)}>
                  <ArrowUpOnSquareStackIcon /> Transfer
                </a>
              )}
            </>
          )}
          {onCancel && (
            <a onClick={() => onCancel()}>
              <XMarkIcon />
            </a>
          )}
        </div>
      )}
    </div>
  );
};

export default Server;
