import { useEffect, useRef, useState } from 'react';
import { useServers } from '../utils/useServers';
import { BlossomClient } from 'blossom-client-sdk';
import { useNDK } from '../ndk';
import { useServerInfo } from '../utils/useServerInfo';
import { useQueryClient } from '@tanstack/react-query';

function Upload() {
  const servers = useServers();
  const { signEventTemplate } = useNDK();
  const { serverInfo } = useServerInfo();
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [uploadTarget, setUploadTarget] = useState<{ [key: string]: boolean }>({});

  const upload = async () => {
    if (inputRef.current && inputRef.current.files) {
      for (const server of servers) {
        if (!uploadTarget[server.name]) {
          continue;
        }
        const serverUrl = serverInfo[server.name].url;
        for (const file of inputRef.current.files) {
          const uploadAuth = await BlossomClient.getUploadAuth(file, signEventTemplate, 'Upload Blob');
          const newBlob = await BlossomClient.uploadBlob(serverUrl, file, uploadAuth);
          console.log(newBlob);
        }
        queryClient.invalidateQueries({ queryKey: ['blobs', server.name] });
      }
    }
  };

  useEffect(() => {
    setUploadTarget(servers.reduce((acc, s) => ({ ...acc, [s.name]: true }), {}));
  }, [servers]);

  return (
    <>
      <h2>Upload</h2>
      <div className=" bg-neutral-800 rounded-xl p-4 text-neutral-400 gap-4 flex flex-col">
          <input className=" cursor-pointer" type="file" ref={inputRef} multiple />

          {servers.map(s => (
            <div className="cursor-pointer flex flex-row gap-2 " key={s.name}>
              <input
                className="w-5 accent-pink-700 hover:accent-pink-600"
                id={s.name}
                type="checkbox"
                checked={uploadTarget[s.name] || false}
                onChange={e => setUploadTarget(ut => ({ ...ut, [s.name]: e.target.checked }))}
              />
              <label htmlFor={s.name} className="cursor-pointer">
                {s.name}
              </label>
            </div>
          ))}

          <button className="p-2 px-4  bg-neutral-600 hover:bg-pink-700 text-white rounded-lg w-2/6" onClick={() => upload()}>
            Upload
          </button>
  
      </div>
    </>
  );
}

export default Upload;
