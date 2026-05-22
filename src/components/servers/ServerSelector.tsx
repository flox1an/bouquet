import { Check, ChevronsUpDown, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useServers } from "@/hooks/use-servers"

export function ServerSelector() {
  const { servers, selectedServer, setSelectedServer } = useServers()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-[200px] justify-between">
          <span className="truncate">
            {selectedServer?.name || "Select server"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[200px]">
        {servers.map((server) => (
          <DropdownMenuItem
            key={server.url}
            onClick={() => setSelectedServer(server)}
          >
            <Check
              className={cn(
                "mr-2 h-4 w-4",
                selectedServer?.url === server.url
                  ? "opacity-100"
                  : "opacity-0"
              )}
            />
            <span className="truncate">{server.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Plus className="mr-2 h-4 w-4" />
          Add server
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
