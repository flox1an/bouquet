import {
  AlertTriangle,
  BadgeCheck,
  Box,
  Clock,
  Files,
  Info,
  Loader2,
  Server as ServerIcon,
  ShieldAlert,
  X,
} from 'lucide-react';
import { formatDate, formatFileSize } from '../../utils/utils';
import { ServerInfo } from '../../utils/useServerInfo';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type ServerProps = {
  server: ServerInfo;
  selectedServer?: string | undefined;
  setSelectedServer?: React.Dispatch<React.SetStateAction<string | undefined>>;
  onCancel?: () => void;
  onCheck?: (server: string) => void;
  blobsOnlyOnThisServer: number;
};

const Server = ({
  server,
  selectedServer,
  setSelectedServer,
  onCancel,
  onCheck,
  blobsOnlyOnThisServer,
}: ServerProps) => {
  const readyToUse = !server.isLoading && !server.isError;
  return (
    <div
      className={
        `server ${selectedServer == server.name ? 'selected' : ''} ` +
        `${readyToUse && setSelectedServer ? ' hover:bg-muted cursor-pointer' : ''}  `
      }
      key={server.name}
      onClick={() => readyToUse && setSelectedServer && setSelectedServer(server.name)}
    >
      <div className=" self-start	pt-1">
        <ServerIcon className="w-6 h-6" />
      </div>
      <div className="flex flex-col grow">
        <div className="server-name">
          {server.name}
          {!server.virtual && (
            <Badge
              variant={selectedServer == server.name ? 'default' : 'secondary'}
              className="ml-2 align-middle"
            >
              {server.type}
            </Badge>
          )}
          {server.isLoading && <Loader2 className="ml-2 h-4 w-4 animate-spin inline" />}
        </div>
        {server.isError ? (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertTriangle className="w-4 h-4" /> Error connecting to server
          </Badge>
        ) : (
          <div className="server-stats">
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="server-stat text-left text-nowrap">
                  <Files className="w-4 h-4" /> {server.count}
                </div>
              </TooltipTrigger>
              <TooltipContent>Number of blobs</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="server-stat text-left text-nowrap">
                  <Box className="w-4 h-4" /> {formatFileSize(server.size)}
                </div>
              </TooltipTrigger>
              <TooltipContent>Total size of blobs</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="server-stat text-left text-nowrap">
                  <Clock className="w-4 h-4" /> {formatDate(server.lastChange)}
                </div>
              </TooltipTrigger>
              <TooltipContent>Date of last change</TooltipContent>
            </Tooltip>
            {server.message && (
              <div className="server-stat">
                <Info className="w-4 h-4 mr-2 text-info" />
                {server.message}
              </div>
            )}
            {server.count > 0 && !server.virtual && (
              <div className="server-stat">
                {blobsOnlyOnThisServer > 0 ? (
                  <div className="flex flex-row gap-2 items-center">
                    <AlertTriangle className="w-4 h-4 text-warning" /> {blobsOnlyOnThisServer} objects only
                    available here
                  </div>
                ) : (
                  <div className="flex flex-row gap-2 items-center">
                    <BadgeCheck className="w-4 h-4 text-success" /> all objects distributed.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {((selectedServer == server.name && !server.virtual) || onCancel) && (
        <div className="server-actions ">
          {selectedServer == server.name && (
            <>
              {onCheck && (
                <a onClick={() => onCheck(server.name)}>
                  <ShieldAlert className="w-4 h-4" /> Check
                </a>
              )}
            </>
          )}
          {onCancel && (
            <a onClick={() => onCancel()}>
              <X className="w-4 h-4" />
            </a>
          )}
        </div>
      )}
    </div>
  );
};

export default Server;
