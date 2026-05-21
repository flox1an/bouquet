import { useMemo, useState } from 'react';
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
import { toast } from '@/hooks/use-toast';

function Home() {
  const [selectedServer, setSelectedServer] = useState<string | undefined>();
  const [isServerListDialogOpen, setIsDialogOpen] = useState(false);
  const { serverInfo, distribution } = useServerInfo();
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
        return deleteNip96File(server, hash, signEventTemplate);
      }
    },
    onError(error) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Could not delete this file.',
      });
    },
  });

  const deleteBlobAcrossServers = async (hash: string, targetServers: Array<Server & { virtual?: boolean }>) => {
    const results = await Promise.allSettled(
      targetServers.map(async server => {
        await deleteBlob.mutateAsync({ server, hash });
        queryClient.setQueryData(['blobs', server.name], (oldData: BlobDescriptor[]) =>
          oldData ? oldData.filter(b => b.sha256 !== hash) : oldData
        );
      })
    );

    const failures = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[];
    if (failures.length > 0) {
      const reason = failures[0].reason;
      const message = reason instanceof Error ? reason.message : 'Unknown server-side error';
      throw new Error(`Failed on ${failures.length}/${targetServers.length} server(s): ${message}`);
    }
  };

  const selectedServerBlobs = useMemo(
    () =>
      selectedServer != undefined
        ? serverInfo[selectedServer].blobs?.sort((a, b) => (a.uploaded > b.uploaded ? -1 : 1))
        : undefined,
    [serverInfo, selectedServer]
  );

  const servers = Object.values(serverInfo).sort((a, b) => {
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
    <div className="mx-auto flex w-full max-w-[80em] flex-col gap-6 py-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <ServerSelect
          servers={servers}
          selectedServer={selectedServer}
          onServerChange={setSelectedServer}
          placeholder="Select a server to browse"
          className="flex-1 max-w-sm"
        />
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleUploadClick}
            disabled={!selectedServer || isAllServersSelected}
            title={isAllServersSelected ? "Cannot upload to 'All servers'" : 'Upload to this server'}
          >
            <Upload className="h-4 w-4" />
            Upload
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} title="Refresh">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(true)} title="Manage servers">
            <Settings className="h-4 w-4" />
            Manage
          </Button>
        </div>
      </div>

      <ServerListPopup
        isOpen={isServerListDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onSave={handleSaveServers}
        initialServers={servers.filter(s => !s.virtual)}
      />

      {!selectedServer && (
        <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          Select a server to browse content.
        </div>
      )}

      {selectedServer && serverInfo[selectedServer] && (!selectedServerBlobs || selectedServerBlobs.length === 0) && (
        <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center text-sm text-muted-foreground">
          No files found on this server yet.
        </div>
      )}

      {selectedServer && serverInfo[selectedServer] && selectedServerBlobs && selectedServerBlobs.length > 0 && (
        <BlobList
          title={`Content on ${serverInfo[selectedServer].name}`}
          blobs={selectedServerBlobs}
          onDelete={async blob => {
            const selectedServerInfo = serverInfo[selectedServer];
            if (!selectedServerInfo) return;

            const targets = selectedServerInfo.virtual
              ? (distribution[blob.sha256]?.servers || [])
                  .map(serverName => serverInfo[serverName])
                  .filter(server => !!server && !server.virtual)
              : [selectedServerInfo];

            if (targets.length === 0) {
              throw new Error('No real server found for this file.');
            }

            await deleteBlobAcrossServers(blob.sha256, targets);
            queryClient.invalidateQueries({ queryKey: ['blobs'] });
          }}
        />
      )}
    </div>
  );
}

export default Home;
