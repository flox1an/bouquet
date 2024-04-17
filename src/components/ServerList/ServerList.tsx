import { PlusIcon, ServerIcon } from '@heroicons/react/24/outline';
import { useServerInfo } from '../../utils/useServerInfo';
import { Server as ServerType } from '../../utils/useServers';
import Server from './Server';
import './ServerList.css';

type ServerListProps = {
  servers: ServerType[];
  selectedServer?: string | undefined;
  setSelectedServer?: React.Dispatch<React.SetStateAction<string | undefined>>;
  onTransfer?: (server: string) => void;
  onCancel?: () => void;
  onCheck?: (server: string) => void;
  title?: React.ReactElement;
  showAddButton?: boolean;
};

export const ServerList = ({
  servers,
  selectedServer,
  setSelectedServer,
  onTransfer,
  onCancel,
  title,
  showAddButton = false,
}: ServerListProps) => {
  const { serverInfo, distribution } = useServerInfo();
  const blobsWithOnlyOneOccurance = Object.values(distribution)
    .filter(d => d.servers.length == 1)
    .map(d => ({ ...d.blob, server: d.servers[0] }));

  return (
    <>
      <div className={`server-list-header ${!title ? 'justify-end' : ''}`}>
        {title && <h2>{title}</h2>}
        {showAddButton && (
          <div className="content-center">
            <button onClick={() => {}} className="flex flex-row gap-2" title="Add server">
              <PlusIcon />
              <ServerIcon />
            </button>
          </div>
        )}
      </div>

      <div className="server-list">
        {servers.map(server => (
          <Server
            key={server.name}
            serverInfo={serverInfo[server.name]}
            server={server}
            selectedServer={selectedServer}
            setSelectedServer={setSelectedServer}
            onTransfer={onTransfer}
            onCancel={onCancel}
            /* onCheck={onCheck} */
            blobsOnlyOnThisServer={blobsWithOnlyOneOccurance.filter(b => b.server == server.name).length}
          ></Server>
        ))}
      </div>
    </>
  );
};
