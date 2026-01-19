import { useMemo, useState } from 'react';
import './Home.css';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BlobDescriptor, BlossomClient } from 'blossom-client-sdk';
import { useNostr } from '../utils/nostr';
import BlobList from '../components/BlobList/BlobList';
import { useServerInfo } from '../utils/useServerInfo';
import { ServerSelect } from '../components/ServerList/ServerSelect';
import ServerListPopup from '../components/ServerListPopup';
import { Server, useUserServers } from '../utils/useUserServers';
import { deleteNip96File } from '../utils/nip96';
import { Button } from '@/components/ui/button';
import { RefreshCw, Settings, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/* BOUQUET Blob Organizer Update Quality Use Enhancement Tool */

function Home() {
  const [selectedServer, setSelectedServer] = useState<string | undefined>();
  const [isServerListDialogOpen, setIsDialogOpen] = useState(false);
  const { serverInfo } = useServerInfo();
  const { storeUserServers } = useUserServers();
  const { signEventTemplate } = useNostr();
  const navigate = useNavigate();

  const queryClient = useQueryClient();

  const deleteBlob = useMutation({
    mutationFn: async ({ server, hash }: { server: Server; hash: string }) => {
      if (server.type === 'blossom') {
        const deleteAuth = await BlossomClient.createDeleteAuth(signEventTemplate, hash);
        return BlossomClient.deleteBlob(server.url, hash, { auth: deleteAuth });
      } else {
        return await deleteNip96File(server, hash, signEventTemplate);
      }
    },
    onSuccess(_, variables) {
      queryClient.setQueryData(['blobs', variables.server.name], (oldData: BlobDescriptor[]) =>
        oldData ? oldData.filter(b => b.sha256 !== variables.hash) : oldData
      );
      // console.log({ key: ['blobs', variables.serverName] });
    },
  });

  const selectedServerBlobs = useMemo(
    () =>
      selectedServer != undefined
        ? serverInfo[selectedServer].blobs?.sort(
            (a, b) => (a.uploaded > b.uploaded ? -1 : 1) // descending
          )
        : undefined,
    [serverInfo, selectedServer]
  );

  const servers = Object.values(serverInfo).sort((a, b) => {
    // "All servers" (virtual) should always be first
    if (a.virtual && !b.virtual) return -1;
    if (!a.virtual && b.virtual) return 1;
    return a.name.localeCompare(b.name);
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['blobs'] });
    queryClient.invalidateQueries({ queryKey: ['use-event'] });
  };

  const handleSaveServers = async (newServers: Server[]) => {
    await storeUserServers(newServers);
    queryClient.invalidateQueries({ queryKey: ['use-event'] });
  };

  const handleUploadClick = () => {
    if (selectedServer && serverInfo[selectedServer]) {
      navigate('/upload', { state: { preSelectedServer: serverInfo[selectedServer] } });
    }
  };

  const isAllServersSelected = selectedServer ? serverInfo[selectedServer]?.virtual === true : false;

  return (
    <div className="flex flex-col mx-auto max-w-[80em] w-full">
      <div className="flex items-center gap-2 py-4">
        <ServerSelect
          servers={servers}
          selectedServer={selectedServer}
          onServerChange={setSelectedServer}
          placeholder="Select a server to browse"
          className="flex-1 max-w-md"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleUploadClick}
          disabled={!selectedServer || isAllServersSelected}
          title={isAllServersSelected ? "Cannot upload to 'All servers'" : 'Upload to this server'}
        >
          <Upload className="h-4 w-4 mr-1" /> Upload
        </Button>
        <Button variant="ghost" size="sm" onClick={handleRefresh} title="Refresh">
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setIsDialogOpen(true)} title="Manage servers">
          <Settings className="h-4 w-4 mr-1" /> Manage
        </Button>
      </div>

      <ServerListPopup
        isOpen={isServerListDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSave={handleSaveServers}
        initialServers={servers.filter(s => !s.virtual)}
      />

      {selectedServer && serverInfo[selectedServer] && selectedServerBlobs && selectedServerBlobs.length > 0 && (
        <BlobList
          className="mt-4"
          title={`Content on ${serverInfo[selectedServer].name}`}
          blobs={selectedServerBlobs}
          onDelete={async blobs => {
            for (const blob of blobs) {
              await deleteBlob.mutateAsync({
                server: serverInfo[selectedServer],
                hash: blob.sha256,
              });
            }
          }}
        />
      )}
    </div>
  );
}

export default Home;
