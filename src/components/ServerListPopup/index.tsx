import { ArrowDownIcon, ArrowUpIcon, TrashIcon } from '@heroicons/react/24/outline';
import React, { useState, useEffect, useRef } from 'react';
import { Server } from '../../utils/useUserServers';

interface ServerListPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (servers: Server[]) => void;
  initialServers: Server[];
}

const ServerListPopup: React.FC<ServerListPopupProps> = ({ isOpen, onClose, onSave, initialServers }) => {
  const [servers, setServers] = useState<Server[]>([]);
  const [newServer, setNewServer] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    setServers(initialServers);
  }, [initialServers]);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [isOpen]);

  const handleAddServer = () => {
    if (newServer.trim()) {
      setServers([...servers, { name: newServer.trim(), url: newServer.trim(), type: 'blossom' }]);
      setNewServer('');
    }
  };

  const handleDeleteServer = (url: string) => {
    setServers(servers.filter(server => server.url !== url));
  };

  const handleMoveUp = (index: number) => {
    if (index > 0) {
      const newServers = [...servers];
      [newServers[index], newServers[index - 1]] = [newServers[index - 1], newServers[index]];
      setServers(newServers);
    }
  };

  const handleMoveDown = (index: number) => {
    if (index < servers.length - 1) {
      const newServers = [...servers];
      [newServers[index], newServers[index + 1]] = [newServers[index + 1], newServers[index]];
      setServers(newServers);
    }
  };

  const handleSave = () => {
    onSave(servers);
    onClose();
  };

  return (
    <>
      {isOpen && <div className="fixed top-0 left-0 w-full h-full bg-black opacity-50 z-50" />}
      <dialog ref={dialogRef} className="p-6 bg-base-300 rounded-lg shadow-lg w-full max-w-lg mx-auto">
        <div>
          <h2 className="text-xl font-semibold">Manage Servers</h2>

          <ul className="mt-4">
            {servers.map((server, index) => (
              <li key={server.url} className="flex items-center justify-between mt-2">
                <span>{server.url}</span>
                <div className="flex items-center space-x-2">
                  <button className="btn btn-ghost btn-sm" onClick={() => handleMoveUp(index)}>
                    <ArrowUpIcon className="h-5 w-5" />
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleMoveDown(index)}>
                    <ArrowDownIcon className="h-5 w-5" />
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteServer(server.url)}>
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-row gap-2">
            <input
              type="text"
              className="input input-bordered w-full"
              placeholder="Enter server URL"
              value={newServer}
              onChange={e => setNewServer(e.target.value)}
            />
            <button className="btn btn-primary" onClick={handleAddServer}>
              Add Server
            </button>
          </div>

          <div className="mt-4 flex justify-end space-x-2">
            <button className="btn" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
};

export default ServerListPopup;
