import { useMemo, useState } from 'react';
import './Home.css';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BlobDescriptor, BlossomClient } from 'blossom-client-sdk';
import { useNDK } from '../utils/ndk';
import BlobList from '../components/BlobList/BlobList';
import { useServerInfo } from '../utils/useServerInfo';
import { ServerList } from '../components/ServerList/ServerList';
import { useNavigate } from 'react-router-dom';

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
    mutationFn: async ({ serverUrl, hash }: { serverName: string; serverUrl: string; hash: string }) => {
      const deleteAuth = await BlossomClient.getDeleteAuth(hash, signEventTemplate, 'Delete Blob');
      return BlossomClient.deleteBlob(serverUrl, hash, deleteAuth);
    },
    onSuccess(_, variables) {
      queryClient.setQueryData(['blobs', variables.serverName], (oldData: BlobDescriptor[]) =>
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
    <>
      {Object.values(serverInfo).length > 1 && (
        <ServerList
          servers={Object.values(serverInfo).sort()}
          selectedServer={selectedServer}
          setSelectedServer={setSelectedServer}
          onTransfer={() => navigate('/transfer/' + selectedServer)}
          onCheck={() => navigate('/check/' + selectedServer)}
          title={<>Servers</>}
          manageServers={true}
          withVirtualServers={true}
        ></ServerList>
      )}

      {selectedServer && serverInfo[selectedServer] && selectedServerBlobs && (
        <BlobList
          className="mt-4"
          title={`Content on ${serverInfo[selectedServer].name}`}
          blobs={selectedServerBlobs}
          onDelete={blob =>
            deleteBlob.mutate({
              serverName: serverInfo[selectedServer].name,
              serverUrl: serverInfo[selectedServer].url,
              hash: blob.sha256,
            })
          }
        ></BlobList>
      )}
    </>
  );
}

export default Home;
