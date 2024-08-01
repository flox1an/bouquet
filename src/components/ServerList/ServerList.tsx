import { ArrowPathRoundedSquareIcon, Cog8ToothIcon } from '@heroicons/react/24/outline';
import { ServerInfo, useServerInfo } from '../../utils/useServerInfo';
import { Server as ServerType, useUserServers } from '../../utils/useUserServers';
import Server from './Server';
import './ServerList.css';
import ServerListPopup from '../ServerListPopup';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

type ServerListProps = {
  servers: ServerInfo[];
  selectedServer?: string | undefined;
  setSelectedServer?: React.Dispatch<React.SetStateAction<string | undefined>>;
  onCancel?: () => void;
  onCheck?: (server: string) => void;
  title?: React.ReactElement;
  manageServers?: boolean;
  withVirtualServers?: boolean;
};

export const ServerList = ({
  servers,
  selectedServer,
  setSelectedServer,
  onCancel,
  title,
  manageServers = false,
  withVirtualServers = false,
}: ServerListProps) => {
  const { storeUserServers } = useUserServers();
  const { distribution } = useServerInfo();
  const queryClient = useQueryClient();
  const blobsWithOnlyOneOccurance = Object.values(distribution)
    .filter(d => d.servers.length == 1)
    .map(d => ({ ...d.blob, server: d.servers[0] }));

  const [isServerListDialogOpen, setIsDialogOpen] = useState(false);

  const handleOpenDialog = () => {
    setIsDialogOpen(true);
  };

  const handleServerListDialogClose = () => {
    setIsDialogOpen(false);
  };

  const handleSaveServers = async (newServers: ServerType[]) => {
    await storeUserServers(newServers);
    queryClient.invalidateQueries({ queryKey: ['use-event'] });
  };

  const serversToList = useMemo(
    () => (withVirtualServers ? servers : servers.filter(s => !s.virtual)),
    [servers, withVirtualServers]
  );

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['blobs'] });
    queryClient.invalidateQueries({ queryKey: ['use-event'] });
  };

  return (
    <>
      <div className={`flex flex-row py-4 ${!title ? 'justify-end' : ''}`}>
        {title && <h2 className=" flex-grow">{title}</h2>}

        {manageServers && (
          <div className="content-center">
            <button onClick={handleRefresh} className="btn btn-ghost btn-sm" title="Refresh">
              <ArrowPathRoundedSquareIcon className="h-6 w-6" /> Refresh
            </button>
            <button onClick={handleOpenDialog} className="btn btn-ghost btn-sm" title="Manage servers">
              <Cog8ToothIcon className="h-6 w-6" /> Manage servers
            </button>
          </div>
        )}
      </div>

      <ServerListPopup
        isOpen={isServerListDialogOpen}
        onClose={handleServerListDialogClose}
        onSave={handleSaveServers}
        initialServers={servers.filter(s => !s.virtual)}
      />

      <div className="server-list">
        {serversToList.map(server => (
          <Server
            key={server.name}
            server={server}
            selectedServer={selectedServer}
            setSelectedServer={setSelectedServer}
            onCancel={onCancel}
            /* onCheck={onCheck} */
            blobsOnlyOnThisServer={blobsWithOnlyOneOccurance.filter(b => b.server == server.name).length}
          ></Server>
        ))}
      </div>
    </>
  );
};
