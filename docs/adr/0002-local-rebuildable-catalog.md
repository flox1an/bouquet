# The catalog is local and rebuildable, with explicit discovery limits

The catalog is an IndexedDB index per browser profile, rebuilt from the user's relays and media servers. There is no backend, no account-side storage, and no sync between devices; a user switching browsers rebuilds it from the same sources. We also do not index the global Nostr network: membership in a user's context must always be explainable by stored evidence (server list, own event, upload, mirror, rescan), and reverse lookups admit only clear media companions of a hit, never an unbounded crawl.

Consequence: the catalog can answer "what do I have" offline after initial sync, and every counter is a statement about *known* hashes, not a guaranteed inventory (see ADR-0005). Accepted cost: library state does not follow the user across devices or browsers.
