# Release notes

## 0.1.0 — Nostr-event-centric browse

This release replaces the blob-centric browse model with a catalog of Nostr
events, and makes mirror and sync actually executable.

### Browse is now built on events, not servers

Previously you picked a server, got its list of blob descriptors, and worked on
individual hashes. That model could not answer "what do I have?" without a
server selected, split one logical medium into dozens of rows, and showed the
same blob three times when it lived on three servers.

Browse now opens on your complete asset list with no server selected:

- An HLS video is **one** entry; its segments live in the detail view.
- A blob stored on three servers is one entry with a replica count.
- A file with no Nostr event stays visible as an "Unlinked file" — nothing you
  own becomes unreachable.
- Entries lead with the kind of Nostr event (Note, Picture, Video, Track), its
  title, and its own words. File counts, sizes and replica counts moved to a
  single quiet line.
- The detail view shows the event's author as an npub and links out to njump so
  you can open the actual post in a normal Nostr client.

Two views share one data set, filters, search, selection and scroll position: a
media grid grouped by month, and a virtualised list for dense technical work.

### Mirror and sync now execute

Mirror and sync previously only previewed what they would do. They now transfer
bytes, reusing the BUD-04 mirror path with automatic fallback to upload:

- Every action shows a plan first, naming each affected blob and server, and
  refuses with a reason when an asset's graph is incomplete.
- Mirror copies only what the destination is actually missing, and says how many
  that is before you start.
- Progress is reported per blob, failures per server, and one failure does not
  abort the batch.
- Cancelling stops scheduling further transfers; whatever already completed is
  recorded, so re-running skips it.

### Search

Search matches event text and titles, and also sha256 prefixes of eight
characters or more, so "does this blob still exist anywhere?" is answerable
without the old blob list.

### Removed

The separate Timeline navigation entry (Browse now serves it, and `/timeline`
redirects), the four redundant gallery/video/audio/document modes, the
relationship tree, and roughly 690 lines of superseded graph code.

### Known limitations

- **Mirror and sync target Blossom servers.** NIP-96 servers are reachable
  through the upload fallback but are not offered as explicit sync destinations.
- **No resume journal.** A cancelled run is resumed by simply running the action
  again; completed transfers are skipped because they are already present. There
  is no persisted job state across a page reload.
- **Main bundle is ~1.0 MB (~330 kB gzipped).** Accepted for the current usage
  profile; routes are already lazy-loaded.
- **The catalog is local to each browser profile.** It is an IndexedDB index
  rebuilt from your relays and servers, not synced between devices.
- **Transfer page remains blob-centric.** It was deliberately left on the older
  model in this release.
