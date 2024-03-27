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
};

export const ServerList = ({ servers, selectedServer, setSelectedServer, onTransfer, onCancel }: ServerListProps) => {
  const { serverInfo, distribution } = useServerInfo();
  const blobsWithOnlyOneOccurance = Object.values(distribution)
    .filter(d => d.servers.length == 1)
    .map(d => ({ ...d.blob, server: d.servers[0] }));

  return (
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
  );
};
