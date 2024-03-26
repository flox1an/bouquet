import {
  ArrowPathIcon,
  ArrowUpOnSquareStackIcon,
  ClockIcon,
  CubeIcon,
  DocumentDuplicateIcon,
  ServerIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { formatDate, formatFileSize } from '../../utils';
import { useServerInfo } from '../../utils/useServerInfo';
import './ServerList.css';
import { Server } from '../../utils/useServers';

type ServerListProps = {
  servers: Server[];
  selectedServer?: string | undefined;
  setSelectedServer?: React.Dispatch<React.SetStateAction<string | undefined>>;
  onTransfer?: (server: string) => void;
  onCancel?: () => void;
};

export const ServerList = ({ servers, selectedServer, setSelectedServer, onTransfer, onCancel }: ServerListProps) => {
  const serverInfo = useServerInfo();
  //
  return (
    <div className="server-list">
      {servers.map((server, sx) => (
        <div
          className={`server ${selectedServer == server.name ? 'selected' : ''}`}
          key={sx}
          onClick={() => setSelectedServer && setSelectedServer(server.name)}
        >
          <div className="server-icon">
            <ServerIcon />
          </div>
          <div className="flex flex-col grow">
            <div className="server-name">
              {server.name}
              {serverInfo[server.name].isLoading && <ArrowPathIcon className="loading" />}
            </div>
            <div className="server-stats">
              <div className="server-stat">
                <DocumentDuplicateIcon /> {serverInfo[server.name].count}
              </div>
              <div className="server-stat">
                <CubeIcon /> {formatFileSize(serverInfo[server.name].size)}
              </div>
              <div className="server-stat">
                <ClockIcon /> {formatDate(serverInfo[server.name].lastChange)}
              </div>
            </div>
          </div>
          {((selectedServer == server.name && onTransfer) || onCancel) && (
            <div className="server-actions">
              {selectedServer == server.name && onTransfer && (
                <a onClick={() => onTransfer(server.name)}>
                  <ArrowUpOnSquareStackIcon /> Transfer
                </a>
              )}
              {onCancel && (
                <a onClick={() => onCancel()}>
                  <XMarkIcon />
                </a>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
