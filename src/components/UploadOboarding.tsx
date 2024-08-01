import { ServerIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';
import { Server, useUserServers } from '../utils/useUserServers';

const defaultServers: (Server & { description: string; buyUrl?: string })[] = [
  {
    name: 'nostr.build',
    url: 'https://nostr.build',
    buyUrl: 'https://nostr.build/plans/',
    description: 'Free tier is limited to 20MB upload size.',
    type: 'nip96',
  },
  {
    name: 'nostrcheck.me',
    url: 'https://cdn.nostrcheck.me',
    description: 'Free server from nostrcheck.me',
    type: 'blossom',
  },
  {
    name: 'satellite.earth',
    url: 'https://cdn.satellite.earth',
    description: 'A payed blossom server with cheap prices 0.05 USD per GB/month.',
    buyUrl: 'https://cdn.satellite.earth/',
    type: 'blossom',
  },
  {
    name: 'files.v0l.io',
    url: 'https://files.v0l.io',
    description: 'A free blossom server.',
    type: 'blossom',
  },
  {
    name: 'blossom.primal.net',
    url: 'https://blossom.primal.net',
    description: 'Blossom server from Primal.',
    type: 'blossom',
  },
];
export default function UploadOnboarding() {
  const [checkedState, setCheckedState] = useState(new Array(defaultServers.length).fill(true));
  const { storeUserServers } = useUserServers();

  const handleCheckboxChange = (index: number) => {
    const updatedCheckedState = checkedState.map((item, pos) => (pos === index ? !item : item));
    setCheckedState(updatedCheckedState);
  };

  return (
    <div>
      <h2 className="text-2xl py-4">You don't have any servers yet</h2>
      <p className="py-4">Please choose some of the following options...</p>

      <div>
        {defaultServers.map((server, index) => (
          <div
            key={server.name}
            className="flex flex-row items-start gap-2 my-2 p-4 bg-base-200 rounded-md cursor-pointer"
            onClick={() => handleCheckboxChange(index)}
          >
            <div className="flex  justify-center items-center gap-2">
              <input
                type="checkbox"
                className="checkbox checkbox-primary"
                checked={checkedState[index]}
                onChange={() => handleCheckboxChange(index)}
              />
            </div>
            <div className="flex flex-col">
              <span className="flex items-center gap-2">
                <span className="flex items-center gap-2 text-accent">
                  <ServerIcon className="w-4 h-4" /> {server.name}
                </span>
                <span className="badge badge-primary">{server.type}</span>
              </span>
              <p>
                {server.description}{' '}
                {server.buyUrl && (
                  <a
                    href={server.buyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-sm btn-neutral mt-1"
                  >
                    Buy Storage
                  </a>
                )}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-center">
        <button
          className="btn btn-primary"
          onClick={() => {
            storeUserServers(defaultServers);
          }}
        >
          Use these servers
        </button>
      </div>
    </div>
  );
}
