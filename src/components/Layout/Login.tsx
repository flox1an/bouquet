import React, { useCallback, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import useLocalStorageState from '../../utils/useLocalStorageState';
import { useCurrentUser, ExtensionMissingError } from '../../hooks/useCurrentUser';
import { cn } from '@/lib/utils';
import { QRCodeLogin } from './QRCodeLogin';

type LoginMethod = 'extension' | 'qr' | 'bunker' | 'nsec';

const Login: React.FC = () => {
  const { loginWithExtension, loginWithBunker, loginWithNsec } = useCurrentUser();
  const [, setAutoLogin] = useLocalStorageState('autologin', { defaultValue: false });

  const [activeTab, setActiveTab] = useState<LoginMethod>('extension');
  const [bunkerUri, setBunkerUri] = useState('');
  const [nsecKey, setNsecKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Stable identities: QRCodeLogin regenerates its code whenever these change.
  const handleQrLogin = useCallback(() => setAutoLogin(true), [setAutoLogin]);
  const handleQrError = useCallback((err: string) => setError(`Couldn't log in with QR code: ${err}`), []);

  const handleExtensionLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await loginWithExtension();
      setAutoLogin(true);
    } catch (err) {
      if (err instanceof ExtensionMissingError) {
        setError('No browser extension found. Install Alby, nos2x, or another Nostr signer extension.');
      } else {
        setError(`Couldn't log in with browser extension: ${err instanceof Error ? err.message : 'unknown error'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBunkerLogin = async () => {
    if (!bunkerUri.trim()) {
      setError('Paste a bunker:// connection string');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await loginWithBunker(bunkerUri);
      setAutoLogin(true);
    } catch (err) {
      setError(`Couldn't log in with remote signer: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleNsecLogin = async () => {
    if (!nsecKey.trim()) {
      setError('Paste your private key');
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await loginWithNsec(nsecKey);
      setAutoLogin(false);
    } catch (err) {
      setError(`Couldn't log in with private key: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const tabs: { id: LoginMethod; label: string }[] = [
    { id: 'extension', label: 'Extension' },
    { id: 'qr', label: 'QR code' },
    { id: 'bunker', label: 'Signer' },
    { id: 'nsec', label: 'Key' },
  ];

  const selectTab = (id: LoginMethod) => {
    setActiveTab(id);
    setError(null);
  };

  // WAI-ARIA tabs pattern: arrow keys move between tabs, only the active tab is in the Tab order.
  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length].id;
    selectTab(next);
    document.getElementById(`login-tab-${next}`)?.focus();
  };

  return (
    <div className="flex flex-col justify-center items-center h-[80vh] gap-4">
      <img src="/bouquet.png" alt="" className="w-28" />
      <h1 className="text-4xl font-bold">bouquet</h1>
      <h2 className="text-xl text-muted-foreground">organize assets your way</h2>

      <Card className="w-full max-w-96 mt-8">
        <CardContent className="pt-6">
          <div role="tablist" aria-label="Login method" className="flex rounded-lg bg-muted p-1 mb-4">
            {tabs.map((tab, i) => (
              <button
                key={tab.id}
                id={`login-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls="login-tabpanel"
                tabIndex={activeTab === tab.id ? 0 : -1}
                className={cn(
                  'flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
                  activeTab === tab.id ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => selectTab(tab.id)}
                onKeyDown={e => onTabKeyDown(e, i)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-destructive/10 text-destructive text-sm"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div id="login-tabpanel" role="tabpanel" aria-labelledby={`login-tab-${activeTab}`} className="space-y-4">
            {activeTab === 'extension' && (
              <>
                <p className="text-sm text-muted-foreground">
                  Log in using a browser extension like Alby, nos2x, or Nostr Connect.
                  <span className="mt-1 block text-xs">Uses NIP-07.</span>
                </p>
                <Button className="w-full" onClick={handleExtensionLogin} disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  Log in with browser extension
                </Button>
              </>
            )}

            {activeTab === 'qr' && (
              <QRCodeLogin onLogin={handleQrLogin} onError={handleQrError} />
            )}

            {activeTab === 'bunker' && (
              <>
                <p className="text-sm text-muted-foreground">
                  Paste the bunker:// connection string from your remote signer app.
                  <span className="mt-1 block text-xs">Uses NIP-46.</span>
                </p>
                <Input
                  type="text"
                  aria-label="Remote signer connection string"
                  placeholder="bunker://…"
                  value={bunkerUri}
                  onChange={e => setBunkerUri(e.target.value)}
                  onKeyDown={e => {
                    // Pressing Enter after pasting a connection string is the whole
                    // interaction; without this the field silently swallows it.
                    if (e.key === 'Enter' && !loading && bunkerUri.trim()) void handleBunkerLogin();
                  }}
                  disabled={loading}
                />
                <Button className="w-full" onClick={handleBunkerLogin} disabled={loading || !bunkerUri.trim()}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  Log in with remote signer
                </Button>
              </>
            )}

            {activeTab === 'nsec' && (
              <>
                <Input
                  type="password"
                  aria-label="Private key"
                  aria-describedby="nsec-hint"
                  placeholder="nsec1… or ncryptsec1…"
                  value={nsecKey}
                  onChange={e => setNsecKey(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !loading && nsecKey.trim()) void handleNsecLogin();
                  }}
                  disabled={loading}
                />
                <p id="nsec-hint" className="text-sm text-muted-foreground">
                  Kept in memory only – you'll need to enter it again next session. A browser extension or remote
                  signer is safer.
                </p>
                <Button className="w-full" onClick={handleNsecLogin} disabled={loading || !nsecKey.trim()}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  Log in with private key
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
