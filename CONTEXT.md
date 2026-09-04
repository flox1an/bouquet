# bouquet

A browser app for managing media files across Nostr media servers (Blossom and NIP-96): upload, browse, mirror/sync between servers, and publish file metadata events.

The vocabulary has two deliberate layers: protocol nouns in code, plain words in the interface. See ADR-0003.

## Language

### Catalog and protocol layer (code terms)

**Blob**:
Immutable binary content identified by its SHA-256 hash. The hash is the canonical identity; a server URL or upload date is not part of the blob.
_Avoid_: file (in code), object

**Server**:
A Blossom or NIP-96 media host the user has configured. Servers differ in capabilities (list, mirror, delete) — absence of a capability is observed, not assumed.
_Avoid_: host, provider

**Catalog**:
The local, rebuildable per-pubkey index of known blobs, membership evidence, availability observations, and authored events. Lives in IndexedDB, one browser profile, no server (ADR-0002).
_Avoid_: library, database, cache

**Evidence**:
A stored record explaining why a blob belongs to a user's context — server list, authored event, upload, mirror, rescan. Every membership must be explainable by at least one evidence record.

**Replica**:
The observed presence of a blob on one server, with state and history. Absence is a time-bound observation, never a permanent truth — except when a full server listing (rescan) or a direct delete confirms removal (ADR-0006). A listing claiming a blob is back cannot override a probe-observed 404; only a fresh probe can.
_Avoid_: copy (in code)

**Asset**:
The catalog's logical medium that a timeline displays: one photo, track, video, or document — possibly many blobs and events. An asset is not a blob.
_Avoid_: file (in code), media object

**Fact**:
A single metadata claim (title, size, type) with provenance and observation time. Contradicting facts may coexist; projection resolves them for display.

**Projection**:
A denormalized view computed from catalog facts for one use case — the timeline projection picks display title, date, and preview without mutating facts.

**Rendition**:
A concrete representation of an asset: original, thumbnail, video variant, HLS master playlist.

**Segment**:
One piece of an HLS stream, referenced by a playlist. Segments are an item's contents,
never items of their own (ADR-0009).

**Kind label**:
The short answer to "what is this?" — "MP4 video", "HLS video", "Unclassified file".
Resolved from the strongest available evidence about a blob, and used as the display
title when the only name a file has is its own hash (ADR-0008).

**Reverse lookup**:
Querying relays by a known hash (`#x`) to find events describing it. Bounded: a hit admits only clear media companions (thumbnail, fallback, subtitle), never an unbounded crawl.

**Run**:
One execution of a batch of tasks with bounded concurrency, per-task outcomes, and a verdict (`allSucceeded`, `failed`, `cancelled`). Partial failure is a first-class outcome, not an error path (ADR-0007).
_Avoid_: job, batch job

**Rescan**:
Re-fetching a server's complete blob list. A complete listing is authoritative presence evidence: missing-from-list removes presence (ADR-0006).

### Interface layer (user-facing words, guarded by `vocabulary.test.tsx`)

**File**:
The UI word for a blob.
_Avoid_: blob, asset (in UI text)

**Item**:
The UI word for the event-centric browse entry.
_Avoid_: asset (in UI text)

**Copy**:
The UI word for a replica — the same file on another server.
_Avoid_: replica (in UI text)

**Unlinked file**:
A file referenced by no authored Nostr event. Stays visible in Browse; being unlinked is a state, not an error.
