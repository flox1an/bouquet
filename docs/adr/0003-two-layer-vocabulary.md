# Two-layer vocabulary: protocol nouns in code, plain words in the interface

The interface no longer says blob, asset, or replica: a stored object is a **file**, the event grouping files is an **item**, the same file on another server is a **copy**. The protocol terms remain correct in code, catalog types, and Blossom APIs — we renamed the UI layer only, not the domain model.

The trade-off: two words per concept is a real cost, paid so users do not have to learn Nostr protocol vocabulary to manage their media. Renaming the code instead was rejected because the terms are protocol-accurate and churn across the catalog, worker bridge, and APIs would buy nothing. The UI layer's vocabulary is guarded by `vocabulary.test.tsx` smoke tests, so the plain words cannot silently regress to protocol jargon. Canonical definitions live in `CONTEXT.md`.
