import { ChevronDown, Server, AlertTriangle, Loader2, HardDrive, FileStack } from 'lucide-react';
import { ServerInfo } from '../../utils/useServerInfo';
import { formatFileSize } from '../../utils/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

type ServerSelectProps = {
  servers: ServerInfo[];
  selectedServer?: string;
  onServerChange: (serverName: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Optional function to get additional preview text for each server (e.g., "3 objects to transfer") */
  getPreviewText?: (server: ServerInfo) => string | undefined;
};

export const ServerSelect = ({
  servers,
  selectedServer,
  onServerChange,
  placeholder = 'Select a server',
  disabled = false,
  className,
  getPreviewText,
}: ServerSelectProps) => {
  const selected = servers.find(s => s.name === selectedServer);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button
          variant="outline"
          className={cn('w-full justify-between h-auto py-2', className)}
          disabled={disabled}
        >
          {selected ? (
            <div className="flex items-center gap-3 text-left">
              <Server className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{selected.name}</span>
                  {!selected.virtual && (
                    <Badge variant="secondary" className="text-xs">
                      {selected.type}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FileStack className="h-3 w-3" />
                    {selected.count} files
                  </span>
                  <span className="flex items-center gap-1">
                    <HardDrive className="h-3 w-3" />
                    {formatFileSize(selected.size)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-[300px]" align="start">
        <DropdownMenuLabel>Select Server</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={selectedServer} onValueChange={onServerChange}>
          {servers.map(server => (
            <DropdownMenuRadioItem
              key={server.name}
              value={server.name}
              className="flex items-start gap-3 py-3 cursor-pointer"
              disabled={server.isError}
            >
              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{server.name}</span>
                  {!server.virtual && (
                    <Badge variant="outline" className="text-xs">
                      {server.type}
                    </Badge>
                  )}
                  {server.isLoading && (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                </div>
                {server.isError ? (
                  <span className="flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="h-3 w-3" />
                    Error connecting
                  </span>
                ) : (
                  <>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>{server.count} files</span>
                      <span>{formatFileSize(server.size)}</span>
                    </div>
                    {getPreviewText && (
                      <span className="text-xs text-primary mt-0.5">
                        {getPreviewText(server)}
                      </span>
                    )}
                  </>
                )}
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
