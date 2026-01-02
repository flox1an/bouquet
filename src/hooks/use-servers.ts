import { useState, useEffect } from "react"
import { useUserServers, Server } from "@/utils/useUserServers"

export type { Server }

export function useServers() {
  const { servers, serversLoading, storeUserServers } = useUserServers()

  const [selectedServer, setSelectedServer] = useState<Server | null>(null)

  // Auto-select first server when servers load
  useEffect(() => {
    if (servers.length > 0 && !selectedServer) {
      setSelectedServer(servers[0])
    }
  }, [servers, selectedServer])

  return {
    servers,
    serversLoading,
    selectedServer,
    setSelectedServer,
    storeUserServers,
  }
}
