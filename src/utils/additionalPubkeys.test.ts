import { describe, expect, it } from 'vitest';
import { nip19 } from 'nostr-tools';
import { parseAdditionalPubkey } from './additionalPubkeys';

const pubkey = 'a'.repeat(64);

describe('parseAdditionalPubkey', () => {
  it('accepts hex, npub, and nprofile inputs', () => {
    expect(parseAdditionalPubkey(pubkey.toUpperCase())).toEqual({ pubkey, relayHints: [] });
    expect(parseAdditionalPubkey(nip19.npubEncode(pubkey))).toEqual({ pubkey, relayHints: [] });
    expect(parseAdditionalPubkey(nip19.nprofileEncode({ pubkey, relays: ['wss://relay.example'] }))).toEqual({
      pubkey,
      relayHints: ['wss://relay.example'],
    });
  });

  it('rejects secrets and unrelated NIP-19 identifiers', () => {
    expect(() => parseAdditionalPubkey('not a pubkey')).toThrow('Enter an npub');
    expect(() => parseAdditionalPubkey(nip19.noteEncode(pubkey))).toThrow('Enter an npub');
  });
});
