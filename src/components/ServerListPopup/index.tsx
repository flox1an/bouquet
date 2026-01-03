import { ArrowUp, ArrowDown, Trash2, Plus, GripVertical, Star, Server as ServerIcon } from "lucide-react"
import React, { useState, useEffect } from "react"
import { Server } from "../../utils/useUserServers"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface ServerListPopupProps {
  isOpen: boolean
  onClose: () => void
  onSave: (servers: Server[]) => void
  initialServers: Server[]
}

const ServerListPopup: React.FC<ServerListPopupProps> = ({
  isOpen,
  onClose,
  onSave,
  initialServers,
}) => {
  const [servers, setServers] = useState<Server[]>([])
  const [newServer, setNewServer] = useState("")
  const [newServerType, setNewServerType] = useState<"blossom" | "nip96">("blossom")

  useEffect(() => {
    setServers(initialServers)
  }, [initialServers])

  const handleAddServer = () => {
    if (newServer.trim()) {
      const url = newServer.trim().startsWith("http")
        ? newServer.trim()
        : `https://${newServer.trim()}`
      const name = new URL(url).hostname
      setServers([...servers, { name, url, type: newServerType }])
      setNewServer("")
    }
  }

  const handleDeleteServer = (url: string) => {
    setServers(servers.filter((server) => server.url !== url))
  }

  const handleMoveUp = (index: number) => {
    if (index > 0) {
      const newServers = [...servers]
      ;[newServers[index], newServers[index - 1]] = [
        newServers[index - 1],
        newServers[index],
      ]
      setServers(newServers)
    }
  }

  const handleMoveDown = (index: number) => {
    if (index < servers.length - 1) {
      const newServers = [...servers]
      ;[newServers[index], newServers[index + 1]] = [
        newServers[index + 1],
        newServers[index],
      ]
      setServers(newServers)
    }
  }

  const handleSave = () => {
    onSave(servers)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage Servers</DialogTitle>
          <DialogDescription>
            Configure your media servers. The first server is used as the primary upload destination.
          </DialogDescription>
        </DialogHeader>

        {servers.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead className="w-24">Type</TableHead>
                  <TableHead className="w-28 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {servers.map((server, index) => (
                  <TableRow key={server.url}>
                    <TableCell>
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {index === 0 && (
                          <span title="Primary server">
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          </span>
                        )}
                        <span className="truncate font-medium">{server.name}</span>
                        <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                          {server.url}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{server.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={index === 0}
                          onClick={() => handleMoveUp(index)}
                          title="Move up"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={index === servers.length - 1}
                          onClick={() => handleMoveDown(index)}
                          title="Move down"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteServer(server.url)}
                          title="Remove server"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center border rounded-md bg-muted/50">
            <ServerIcon className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No servers configured</p>
            <p className="text-xs text-muted-foreground">Add a server below to get started</p>
          </div>
        )}

        <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
          <Label className="text-sm font-medium">Add New Server</Label>
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="https://example.com or example.com"
              value={newServer}
              onChange={(e) => setNewServer(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddServer()}
              className="flex-1"
            />
            <Button onClick={handleAddServer} disabled={!newServer.trim()}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
          <RadioGroup
            value={newServerType}
            onValueChange={(value) => setNewServerType(value as "blossom" | "nip96")}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="blossom" id="blossom" />
              <Label htmlFor="blossom" className="cursor-pointer font-normal">Blossom</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="nip96" id="nip96" />
              <Label htmlFor="nip96" className="cursor-pointer font-normal">NIP-96</Label>
            </div>
          </RadioGroup>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default ServerListPopup
