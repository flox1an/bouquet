import { useEffect, useState, useRef, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Loader2, Smartphone, RefreshCw, Copy, Check } from 'lucide-react'
import { NostrConnectSigner } from 'applesauce-signers'
import { NostrConnectAccount } from 'applesauce-accounts/accounts'
import { useAccountManager } from 'applesauce-react/hooks'
import { Button } from '@/components/ui/button'
import {
  saveAccountToStorage,
  saveActiveAccount,
} from '@/nostr/accountPersistence'
import { DEFAULT_RELAYS, subscriptionMethod, publishMethod } from '@/nostr/core'
import { useNostr } from '@/utils/nostr'

// Build a bunker:// URI from signer properties for persistence
function buildBunkerUri(remotePubkey: string, relays: string[], secret?: string): string {
  const params = new URLSearchParams()
  relays.forEach(relay => params.append('relay', relay))
  if (secret) {
    params.append('secret', secret)
  }
  return `bunker://${remotePubkey}?${params.toString()}`
}

interface QRCodeLoginProps {
  onLogin: () => void
  onError: (error: string) => void
}

export function QRCodeLogin({ onLogin, onError }: QRCodeLoginProps) {
  const accountManager = useAccountManager()
  const { setUserFromPubkey } = useNostr()
  const [nostrConnectUri, setNostrConnectUri] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const signerRef = useRef<NostrConnectSigner | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const generateQRCode = useCallback(async () => {
    // Cleanup previous signer/controller
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    try {
      // Create a new signer for client-initiated connection
      const signer = new NostrConnectSigner({
        relays: DEFAULT_RELAYS,
        subscriptionMethod,
        publishMethod,
      })
      signerRef.current = signer

      // Generate the nostrconnect:// URI
      const uri = signer.getNostrConnectURI({
        name: 'bouquet',
        url: window.location.origin,
        permissions: NostrConnectSigner.buildSigningPermissions([0, 1, 3, 7, 10002]),
      })

      setNostrConnectUri(uri)

      // Create abort controller for cancellation
      const controller = new AbortController()
      abortControllerRef.current = controller

      // Wait for signer to connect
      await signer.waitForSigner(controller.signal)

      // Connected! Get pubkey and create account
      const pubkey = await signer.getPublicKey()
      const account = new NostrConnectAccount(pubkey, signer)

      // Add to account manager
      await accountManager.addAccount(account)
      accountManager.setActive(account)

      // Build bunker URI for persistence using signer properties
      const remotePubkey = signer.remote
      if (!remotePubkey) {
        throw new Error('Failed to get remote signer pubkey')
      }
      const bunkerUri = buildBunkerUri(remotePubkey, DEFAULT_RELAYS, signer.secret)

      // Persist account
      saveAccountToStorage(account, 'bunker', bunkerUri)
      saveActiveAccount(pubkey)

      // Update the user state so the UI reflects the login
      setUserFromPubkey(pubkey)

      onLogin()
    } catch (error) {
      // Check if this was an abort (user cancelled, tab switched, or regenerated)
      const isAbort =
        error instanceof Error &&
        (error.name === 'AbortError' ||
          error.message.toLowerCase().includes('aborted') ||
          error.message.toLowerCase().includes('abort'))
      if (isAbort) {
        return
      }
      console.error('QR code login failed:', error)
      onError(error instanceof Error ? error.message : 'Connection failed')
    }
  }, [accountManager, onLogin, onError, setUserFromPubkey])

  // Generate QR code on mount
  useEffect(() => {
    generateQRCode()

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [generateQRCode])

  const handleRefresh = () => {
    setNostrConnectUri(null)
    setCopied(false)
    generateQRCode()
  }

  const handleCopy = async () => {
    if (!nostrConnectUri) return
    try {
      await navigator.clipboard.writeText(nostrConnectUri)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="text-center">
        <Smartphone className="w-10 h-10 mx-auto mb-2 text-primary" />
        <p className="text-sm text-muted-foreground">
          Scan with your Nostr signer app
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Amber, Nostrudel, or other NIP-46 signers
        </p>
      </div>

      <div className="p-4 bg-white rounded-xl">
        {nostrConnectUri ? (
          <QRCodeSVG value={nostrConnectUri} size={200} level="M" includeMargin={false} />
        ) : (
          <div className="w-[200px] h-[200px] flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          disabled={!nostrConnectUri}
          className="text-muted-foreground"
        >
          {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
          {copied ? 'Copied!' : 'Copy'}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleRefresh} className="text-muted-foreground">
          <RefreshCw className="w-4 h-4 mr-2" />
          New code
        </Button>
      </div>
    </div>
  )
}
