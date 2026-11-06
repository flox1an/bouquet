import { useCallback, useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import { Loader2, Plus, Server as ServerIcon, Trash2 } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader } from '@/components/ui/page-header';
import { ToastAction } from '@/components/ui/toast';
import { useToast } from '@/hooks/use-toast';
import { getCatalogClient } from '../catalog/catalogClient';
import type { AdditionalPubkey } from '../catalog/catalog';
import ServerListPopup from '../components/ServerListPopup';
import { useUserServers } from '../utils/useUserServers';
import { syncAdditionalPubkeyFromRelays } from '../catalog/catalogNostr';
import { useProfile } from '../hooks/useProfile';
import { parseAdditionalPubkey } from '../utils/additionalPubkeys';
import { useNostr } from '../utils/nostr';
import RelaySettings from '../components/RelaySettings';

export default function Settings() {
  const { user } = useNostr();
  const [sources, setSources] = useState<AdditionalPubkey[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [syncing, setSyncing] = useState<Set<string>>(new Set());
  const [serversOpen, setServersOpen] = useState(false);
  const [error, setError] = useState<string>();
  const { servers, serversLoading, storeUserServers } = useUserServers();
  const { toast } = useToast();

  const load = useCallback(async () => {
    if (!user?.pubkey) return;
    setSources((await getCatalogClient().listAdditionalPubkeys(user.pubkey)) ?? []);
    setLoading(false);
  }, [user?.pubkey]);

  useEffect(() => {
    void load().catch((error: unknown) => {
      setError(error instanceof Error ? error.message : String(error));
      setLoading(false);
    });
  }, [load]);

  const add: NonNullable<ComponentProps<'form'>['onSubmit']> = async event => {
    event.preventDefault();
    if (!user?.pubkey || adding) return;
    setAdding(true);
    setError(undefined);
    try {
      const source = parseAdditionalPubkey(input);
      if (source.pubkey === user.pubkey) throw new Error("That's your own profile - it's already included.");
      await getCatalogClient().addAdditionalPubkey(user.pubkey, source);
      await load();
      setInput('');
      setSyncing(current => new Set(current).add(source.pubkey));
      void syncAdditionalPubkeyFromRelays(getCatalogClient(), user.pubkey, source, user.relayUrls)
        .catch((error: unknown) => setError(error instanceof Error ? error.message : String(error)))
        .finally(() =>
          setSyncing(current => {
            const next = new Set(current);
            next.delete(source.pubkey);
            return next;
          })
        );
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setAdding(false);
    }
  };

  const remove = async (source: AdditionalPubkey) => {
    if (!user?.pubkey) return;
    const owner = user.pubkey;
    setError(undefined);
    try {
      await getCatalogClient().removeAdditionalPubkey(owner, source.pubkey);
      setSources(current => current.filter(item => item.pubkey !== source.pubkey));
      toast({
        description: 'Profile removed.',
        action: (
          <ToastAction
            altText="Undo removing profile"
            onClick={() =>
              void getCatalogClient()
                .addAdditionalPubkey(owner, { pubkey: source.pubkey, relayHints: source.relayHints })
                .then(load)
                .catch((error: unknown) => setError(error instanceof Error ? error.message : String(error)))
            }
          >
            Undo
          </ToastAction>
        ),
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col px-4 py-8">
      <PageHeader title="Settings" />

      <RelaySettings />

      <Card>
        <CardHeader>
          <CardTitle>Media servers</CardTitle>
          <CardDescription>
            The Blossom and NIP-96 servers your media lives on. Bouquet looks at the files on these servers to build your
            library, so add them before you scan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {serversLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading servers…
            </p>
          ) : (
            <>
              <p className="font-mono text-xs text-muted-foreground" aria-label="Configured servers">
                {servers.length === 0 ? 'No servers configured yet.' : servers.map(server => server.name).join(' · ')}
              </p>
              <Button variant="outline" className="mt-3" onClick={() => setServersOpen(true)}>
                <ServerIcon className="h-4 w-4" aria-hidden />
                Manage servers
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <ServerListPopup
        isOpen={serversOpen}
        onClose={() => setServersOpen(false)}
        onSave={storeUserServers}
        initialServers={servers}
      />

      <Card>
        <CardHeader>
          <CardTitle>Other profiles' media</CardTitle>
          <CardDescription>
            Include media and websites published by other Nostr profiles. They're read-only: Bouquet never posts as them
            or deletes their files.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={add}>
            <div className="min-w-0 flex-1 space-y-2">
              <Label htmlFor="additional-pubkey">Nostr profile (npub)</Label>
              <Input
                id="additional-pubkey"
                value={input}
                onChange={event => setInput(event.target.value)}
                placeholder="npub1…"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <Button type="submit" disabled={!input.trim() || adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
              Add profile
            </Button>
          </form>

          {error && (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="mt-6 border-t pt-4">
            {loading ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading profiles…
              </p>
            ) : sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No other profiles added yet.</p>
            ) : (
              <ul className="space-y-2" aria-label="Other profiles">
                {sources.map(source => (
                  <AdditionalPubkeyRow
                    key={source.pubkey}
                    source={source}
                    syncing={syncing.has(source.pubkey)}
                    onRemove={() => void remove(source)}
                  />
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function AdditionalPubkeyRow({
  source,
  syncing,
  onRemove,
}: {
  source: AdditionalPubkey;
  syncing: boolean;
  onRemove: () => void;
}) {
  const profile = useProfile(source.pubkey);
  const npub = nip19.npubEncode(source.pubkey);
  const name = profile?.display_name || profile?.name;

  return (
    <li className="flex items-center justify-between gap-3 border bg-muted/30 px-3 py-3">
      <div className="min-w-0">
        {name && <p className="truncate text-sm font-medium">{name}</p>}
        <p className="truncate font-mono text-xs text-muted-foreground" title={npub}>
          {npub}
        </p>
        {syncing && (
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground" role="status">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Scanning relays…
          </p>
        )}
      </div>
      <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove ${name ?? npub}`}>
        <Trash2 className="h-4 w-4" aria-hidden />
      </Button>
    </li>
  );
}
