# Servers without a list endpoint cannot be enumerated; all counts are known hashes

Neither `HEAD /<hash>` nor `GET /<hash>` can discover unknown hashes, so a server without a usable list endpoint (e.g. nostr.build) contributes availability checks for known blobs but no enumeration. Every total in the UI is therefore the sum of *catalog-known* hashes — a lower bound, not a guaranteed inventory.

Consequences: server-list sync state (complete / pending / failed / unsupported per server) is surfaced in the catalog status so counts carry their provenance; new seeds (own events, uploads, imported URLs, manifests) can grow the known set later. Do not "fix" missing files by guessing hashes: enumerating a list-less server is out of scope by design.
