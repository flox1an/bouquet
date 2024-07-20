import { ArrowPathRoundedSquareIcon, Cog8ToothIcon } from '@heroicons/react/24/outline';
import { ServerInfo, useServerInfo } from '../../utils/useServerInfo';
import { Server as ServerType } from '../../utils/useUserServers';
import Server from './Server';
import './ServerList.css';
import ServerListPopup from '../ServerListPopup';
import { useMemo, useState } from 'react';
import { useNDK } from '../../utils/ndk';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import dayjs from 'dayjs';
import { USER_BLOSSOM_SERVER_LIST_KIND } from 'blossom-client-sdk';
import { useQueryClient } from '@tanstack/react-query';

type ServerListProps = {
  servers: ServerInfo[];
  selectedServer?: string | undefined;
  setSelectedServer?: React.Dispatch<React.SetStateAction<string | undefined>>;
  onTransfer?: (server: string) => void;
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
  onTransfer,
  onCancel,
  title,
  manageServers = false,
  withVirtualServers = false,
}: ServerListProps) => {
  const { ndk, user } = useNDK();
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
    const ev = new NDKEvent(ndk, {
      kind: USER_BLOSSOM_SERVER_LIST_KIND,
      created_at: dayjs().unix(),
      content: '',
      pubkey: user?.pubkey || '',
      tags: newServers.filter(s => s.type == 'blossom').map(s => ['server', `${s.url}`]),
    });
    await ev.sign();
    console.log(ev.rawEvent());
    await ev.publish();
  };

  const serversToList = useMemo(
    () => (withVirtualServers ? servers : servers.filter(s => !s.virtual)),
    [servers, withVirtualServers]
  );

  const handleRefresh = () => {
    queryClient.refetchQueries({ queryKey: ['blobs'] });
    queryClient.refetchQueries({ queryKey: ['use-event'] });
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
