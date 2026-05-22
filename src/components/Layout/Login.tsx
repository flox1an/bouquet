import React, { useState } from "react"
import { Loader2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import useLocalStorageState from "../../utils/useLocalStorageState"
import { useCurrentUser, ExtensionMissingError } from "../../hooks/useCurrentUser"
import { cn } from "@/lib/utils"
import { QRCodeLogin } from "./QRCodeLogin"

type LoginMethod = "extension" | "qr" | "bunker" | "nsec"

const Login: React.FC = () => {
  const { loginWithExtension, loginWithBunker, loginWithNsec } = useCurrentUser()
  const [, setAutoLogin] = useLocalStorageState("autologin", { defaultValue: false })

  const [activeTab, setActiveTab] = useState<LoginMethod>("extension")
  const [bunkerUri, setBunkerUri] = useState("")
  const [nsecKey, setNsecKey] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleExtensionLogin = async () => {
    setError(null)
    setLoading(true)
    try {
      await loginWithExtension()
      setAutoLogin(true)
    } catch (err) {
      if (err instanceof ExtensionMissingError) {
        setError("No Nostr extension found. Please install Alby, nos2x, or another NIP-07 extension.")
      } else {
        setError(err instanceof Error ? err.message : "Login failed")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleBunkerLogin = async () => {
    if (!bunkerUri.trim()) {
      setError("Please enter a bunker URI")
      return
    }

    setError(null)
    setLoading(true)
    try {
      await loginWithBunker(bunkerUri)
      setAutoLogin(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bunker login failed")
    } finally {
      setLoading(false)
    }
  }

  const handleNsecLogin = async () => {
    if (!nsecKey.trim()) {
      setError("Please enter your nsec key")
      return
    }

    setError(null)
    setLoading(true)
    try {
      await loginWithNsec(nsecKey)
      setAutoLogin(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nsec login failed")
    } finally {
      setLoading(false)
    }
  }

  const tabs: { id: LoginMethod; label: string }[] = [
    { id: "extension", label: "Extension" },
    { id: "qr", label: "QR" },
    { id: "bunker", label: "Bunker" },
    { id: "nsec", label: "Nsec" },
  ]

  return (
    <div className="flex flex-col justify-center items-center h-[80vh] gap-4">
      <img src="/bouquet.png" alt="logo" className="w-28" />
      <h1 className="text-4xl font-bold">bouquet</h1>
      <h2 className="text-xl text-muted-foreground">organize assets your way</h2>

      <Card className="w-96 mt-8">
        <CardContent className="pt-6">
          <div className="flex rounded-lg bg-muted p-1 mb-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => {
                  setActiveTab(tab.id)
                  setError(null)
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            {activeTab === "extension" && (
              <>
                <p className="text-sm text-muted-foreground">
                  Login using a browser extension like Alby, nos2x, or Nostr Connect.
                </p>
                <Button
                  className="w-full"
                  onClick={handleExtensionLogin}
                  disabled={loading}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Login with Extension
                </Button>
              </>
            )}

            {activeTab === "qr" && (
              <QRCodeLogin
                onLogin={() => setAutoLogin(true)}
                onError={(err) => setError(err)}
              />
            )}

            {activeTab === "bunker" && (
              <>
                <p className="text-sm text-muted-foreground">
                  Login using a NIP-46 bunker connection string.
                </p>
                <Input
                  type="text"
                  placeholder="bunker://..."
                  value={bunkerUri}
                  onChange={(e) => setBunkerUri(e.target.value)}
                  disabled={loading}
                />
                <Button
                  className="w-full"
                  onClick={handleBunkerLogin}
                  disabled={loading || !bunkerUri.trim()}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Connect to Bunker
                </Button>
              </>
            )}

            {activeTab === "nsec" && (
              <>
                <p className="text-sm text-muted-foreground">
                  Login with your private key. Your key is never stored.
                </p>
                <Input
                  type="password"
                  placeholder="nsec1... or ncryptsec1..."
                  value={nsecKey}
                  onChange={(e) => setNsecKey(e.target.value)}
                  disabled={loading}
                />
                <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 text-yellow-600 dark:text-yellow-500 text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>For security, you'll need to re-enter your key each session.</span>
                </div>
                <Button
                  className="w-full"
                  onClick={handleNsecLogin}
                  disabled={loading || !nsecKey.trim()}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Login with Nsec
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default Login
