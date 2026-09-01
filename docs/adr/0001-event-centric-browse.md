# Browse is event-centric, not blob-centric

Blob-centric browse could not answer "what do I have?": without a server selected it showed nothing, one logical medium split into dozens of hash rows, and the same blob appeared three times when it lived on three servers. We replaced it with the catalog timeline: Browse opens on the complete asset list with no server selected, an HLS video is one entry with its segments in the detail view, a blob stored on N servers is one entry with a replica count, and a file with no Nostr event stays visible as an unlinked file rather than becoming unreachable.

The superseded model's UI (per-server listing as the primary view, blob rows as the unit of work, the relationship tree) was removed deliberately; the catalog, not the server response, is the source the interface renders.

Considered options: keeping blob browse as a secondary "technical view" was rejected — two browse models meant two selections, two delete flows, and every UX fix paid twice. The catalog detail views cover the technical needs.
