import { useMemo, useState } from 'react';
import './Home.css';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BlobDescriptor, BlossomClient } from 'blossom-client-sdk';
import { useNDK } from '../utils/ndk';
import BlobList from '../components/BlobList/BlobList';
import { useServerInfo } from '../utils/useServerInfo';
import { ServerList } from '../components/ServerList/ServerList';
import { useNavigate } from 'react-router-dom';
import { Server } from '../utils/useUserServers';
import { deleteNip96File } from '../utils/nip96';

/* BOUQUET Blob Organizer Update Quality Use Enhancement Tool */

// TODOs
/*
- display flle progress for transfer
- stop/pause transfer
- multi threaded sync
- Add server and pulbish list event
- upload to single/multi servers
- upload image resize
- upload & publish as file event to nostr
- check blobs (download & sha256 sum check), maybe limit max size
*/
function Home() {
  const [selectedServer, setSelectedServer] = useState<string | undefined>();
  const { serverInfo } = useServerInfo();
  const navigate = useNavigate();
  const { signEventTemplate } = useNDK();

  const queryClient = useQueryClient();

  const deleteBlob = useMutation({
    mutationFn: async ({ server, hash }: { server: Server; hash: string }) => {
      if (server.type === 'blossom') {
        const deleteAuth = await BlossomClient.createDeleteAuth(signEventTemplate, hash, 'Delete Blob');
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

  return (
    <div className="flex flex-col mx-auto max-w-[80em] w-full">
      <ServerList
        servers={Object.values(serverInfo).sort()}
        selectedServer={selectedServer}
        setSelectedServer={setSelectedServer}
        onCheck={() => navigate('/check/' + selectedServer)}
        title={<>Servers</>}
        manageServers={true}
        withVirtualServers={true}
      ></ServerList>

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
        ></BlobList>
      )}
    </div>
  );
}

export default Home;
