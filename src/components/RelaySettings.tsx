import { useEffect, useState } from 'react';
import { ReadonlyAccount } from 'applesauce-accounts/accounts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { accountManager, useNostr } from '../utils/nostr';
import useEvent from '../utils/useEvent';
import { eventStore, mergeRelays, normalizeRelay } from '../nostr/core';
import { signAndPublish } from '../utils/publish';

type Entry = { url: string; read: boolean; write: boolean };

export default function RelaySettings() {
  const { user } = useNostr();
  const list = useEvent({ kinds: [10002], authors: [user?.pubkey ?? ''] }, { disable: !user, waitForRelays: false });
  const [entries, setEntries] = useState<Entry[]>([]);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const readOnly = !accountManager.active || accountManager.active instanceof ReadonlyAccount;
  const locked = readOnly || saving || list.isLoading;

  useEffect(() => {
    setEntries([]);
    setDirty(false);
    setError('');
    setMessage('');
  }, [user?.pubkey]);

  useEffect(() => {
    if (dirty || !list.data || list.data.pubkey !== user?.pubkey) return;
    setEntries(list.data.tags.filter(tag => tag[0] === 'r' && tag[1]).map(tag => ({
      url: tag[1], read: tag[2] !== 'write', write: tag[2] !== 'read',
    })));
  }, [list.data, user?.pubkey, dirty]);

  const add = () => {
    const normalized = normalizeRelay(url);
    if (!normalized) return setError('Enter a valid ws:// or wss:// relay URL.');
    if (entries.some(entry => normalizeRelay(entry.url) === normalized)) return setError('This relay is already in your list.');
    setEntries([...entries, { url: normalized, read: true, write: true }]);
    setUrl(''); setError(''); setMessage(''); setDirty(true);
  };

  const save = async () => {
    if (!user) return;
    if (entries.some(entry => !entry.read && !entry.write)) return setError('Each relay must be enabled for reading or writing.');
    setSaving(true); setError(''); setMessage('');
    try {
      const tags = [
        ...(list.data?.pubkey === user.pubkey ? list.data.tags.filter(tag => tag[0] !== 'r') : []),
        ...entries.map(entry => entry.read && entry.write ? ['r', entry.url] : ['r', entry.url, entry.read ? 'read' : 'write']),
      ];
      const result = await signAndPublish({ kind: 10002, content: '', tags, pubkey: user.pubkey, created_at: Math.max(Math.floor(Date.now() / 1000), (list.data?.created_at ?? 0) + 1) }, mergeRelays([...entries.map(entry => entry.url), ...(user.relayUrls ?? [])]));
      if (result.verdict === 'disabled' || result.verdict === 'failed') {
        setError(result.verdict === 'disabled' ? 'Publishing is disabled.' : 'No relay accepted your list. Try again.');
      } else {
        eventStore.add(result.event);
        setDirty(false);
        setMessage(result.verdict === 'partial' ? `Saved, but some relays rejected the update: ${result.targets.filter(target => !target.ok).map(target => target.url).join(', ')}` : 'Relay list saved.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the relay list.');
    } finally { setSaving(false); }
  };

  return <Card>
    <CardHeader><CardTitle>Relays</CardTitle><CardDescription>Choose where others send you events and where your events are published. Your relay list is public.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {!user ? <p className="text-sm text-muted-foreground">Sign in to manage your relays.</p> : <>
        {readOnly && <p className="text-sm text-muted-foreground">A signing account is required to change your relay list.</p>}
        {list.isLoading && !dirty && <p role="status" className="text-sm text-muted-foreground">Loading relay list…</p>}
        {!list.isLoading && !entries.length && <p className="text-sm text-muted-foreground">No relays in your list.</p>}
        <ul className="space-y-3" aria-label="Relay list">{entries.map((entry, index) => <li key={`${entry.url}-${index}`} className="rounded-md border p-3 space-y-2">
          <div className="break-all text-sm font-medium">{entry.url}</div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {(['read', 'write'] as const).map(direction => <label key={direction} className="flex items-center gap-2"><input type="checkbox" checked={entry[direction]} disabled={locked} onChange={event => { setEntries(entries.map((item, i) => i === index ? { ...item, [direction]: event.target.checked } : item)); setDirty(true); setMessage(''); }} />{direction === 'read' ? 'Read' : 'Write'}</label>)}
            <Button type="button" variant="ghost" size="sm" disabled={locked} aria-label={`Remove ${entry.url}`} onClick={() => { setEntries(entries.filter((_, i) => i !== index)); setDirty(true); setMessage(''); }}>Remove</Button>
          </div>
        </li>)}</ul>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end"><div className="flex-1 space-y-2"><Label htmlFor="relay-url">Relay URL</Label><Input id="relay-url" placeholder="wss://relay.example" value={url} disabled={locked} onChange={event => setUrl(event.target.value)} /></div><Button type="button" variant="outline" onClick={add} disabled={locked || !url.trim()}>Add relay</Button></div>
        <Button type="button" onClick={() => void save()} disabled={locked || !dirty}>{saving ? 'Saving…' : 'Save relay list'}</Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm">{message}</p>}
      </>}
    </CardContent>
  </Card>;
}
