import { useEffect, useMemo, useState } from 'react';
import './App.css';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BlobDescriptor, BlossomClient } from 'blossom-client-sdk';
import { useNDK } from './ndk';
import BlobList from './components/BlobList/BlobList';
import { useServerInfo } from './utils/useServerInfo';
import { ServerList } from './components/ServerList/ServerList';
import { Layout } from './components/Layout/Layout';
import { Transfer } from './components/Transfer/Transfer';

/* BOUQUET Blob Organizer Update Quality Use Enhancement Tool */

// TODOs
/*
- multi threaded sync
- upload to single/multi servers
- upload exif data removal
- upload image resize
- upload & publish as file event to nostr
- thumbnail gallery
- check blobs (download & sha256 sum check), maybe limit max size
*/
function App() {
  const { loginWithExtension, signEventTemplate } = useNDK();
  const [selectedServer, setSelectedServer] = useState<string | undefined>();
  const [transferSource, setTransferSource] = useState<string | undefined>();
  const serverInfo = useServerInfo();

  useEffect(() => {
    loginWithExtension();
  }, []);

  /*,
    combine: (results) => {
      const dict: BlobDictionary = {};

      results.forEach((server) =>
        server.data && server.data.forEach((blob: BlobDescriptor) => {
          if (dict[blob.sha256]) {
            dict[blob.sha256].urls.push(blob.url);
          } else {
            dict[blob.sha256] = {
              ...blob,
              urls: [blob.url],
            };
          }
        })
      );

      return {
        data: dict,
      };
    },*/

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
      console.log({ key: ['blobs', variables.serverName] });
    },
  });

  const selectedServerBlobs = useMemo(
    () =>
      selectedServer != undefined
        ? serverInfo[selectedServer].blobs?.sort(
            (a, b) => (a.created > b.created ? -1 : 1) // descending
          )
        : undefined,
    [serverInfo, selectedServer]
  );

  return (
    <Layout>
      {transferSource ? (
        <Transfer transferSource={transferSource} onCancel={() => setTransferSource(undefined)} />
      ) : (
        <>
          <h2>Servers</h2>
          <ServerList
            servers={Object.values(serverInfo).sort()}
            selectedServer={selectedServer}
            setSelectedServer={setSelectedServer}
            onTransfer={server => setTransferSource(server)}
          ></ServerList>

          {selectedServer && serverInfo[selectedServer] && selectedServerBlobs && (
            <>
              <h2>Your objects on {serverInfo[selectedServer].name}</h2>
              <BlobList
                blobs={selectedServerBlobs}
                onDelete={blob =>
                  deleteBlob.mutate({
                    serverName: serverInfo[selectedServer].name,
                    serverUrl: serverInfo[selectedServer].url,
                    hash: blob.sha256,
                  })
                }
              ></BlobList>
            </>
          )}
        </>
      )}
    </Layout>
  );
}

export default App;
