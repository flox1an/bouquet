import { nip19 } from 'nostr-tools';
import type { ProfilePointer } from 'nostr-tools/nip19';

export type ParsedAdditionalPubkey = { pubkey: string; relayHints: string[] };

export function parseAdditionalPubkey(input: string): ParsedAdditionalPubkey {
  const value = input.trim().replace(/^nostr:/i, '');
  if (/^[a-f0-9]{64}$/i.test(value)) return { pubkey: value.toLowerCase(), relayHints: [] };

  try {
    const decoded = nip19.decode(value);
    if (decoded.type === 'npub') return { pubkey: decoded.data, relayHints: [] };
    if (decoded.type === 'nprofile') {
      const profile = decoded.data as ProfilePointer;
      return { pubkey: profile.pubkey, relayHints: profile.relays ?? [] };
    }
  } catch {
    // Use the same error for malformed and unsupported NIP-19 values.
  }
  throw new Error('Enter an npub, nprofile, or 64-character hex pubkey');
}
