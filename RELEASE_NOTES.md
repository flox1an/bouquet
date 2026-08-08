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

### ### Sync identifies media by its event too

The sync list previously labelled every row with fifteen characters of a
sha256. It now leads with the event title and kind, keeping the hash as
secondary text, and says plainly when a file is referenced by no event — that
state means the file is not used by any of your posts.

Titles come from one shared helper, so a file cannot be named one thing in
Browse and another in Sync.

### The app no longer claims work it has not done

- Publishing awaited nothing, so the completion screen could appear before
  publishing finished and failures vanished silently. It now settles first and
  reports per-file errors.
- The delete dialog reported "N files deleted successfully" from a counter that
  ignored failures. It now names what could not be deleted.
- Onboarding showed server checkboxes and then saved the full default list,
  ignoring what you unchecked.

### It is harder to get stuck

Every asynchronous chain in the app now has a failure path. Dialogs that block
escape while running always offer a way out when they stop, and a failure after
a successful transfer says the transfer happened and only the local view is
stale, rather than implying data was lost.

### Accessibility and small screens

Logout is reachable on a phone, icon-only controls have names, the theme
control names the action rather than the state, pinch-zoom is no longer
blocked, and dialogs fit a 375px viewport. Every external link carries
rel="noreferrer".

### Plain words instead of protocol vocabulary

The interface no longer says blob, asset or replica. A stored object is a
**file**, the Nostr event that groups files is an **item**, and the same file on
another server is a **copy**. The protocol terms remain correct in the code and
in the Blossom APIs; they just are not the words a user has to learn.

Known limitations

- **Mirror and sync target Blossom servers.** NIP-96 servers are reachable
  through the upload fallback but are not offered as explicit sync destinations.
- **No resume journal.** A cancelled run is resumed by simply running the action
  again; completed transfers are skipped because they are already present. There
  is no persisted job state across a page reload.
- **Main bundle is ~1.0 MB (~330 kB gzipped).** Accepted for the current usage
  profile; routes are already lazy-loaded and the heavy pages (Upload, Timeline,
  Transfer, catalog) are separate chunks. Removing unused dependencies did not
  change it - they were already tree-shaken - so reducing it further means
  splitting what the app genuinely loads at start, not pruning the manifest.
- **The catalog is local to each browser profile.** It is an IndexedDB index
  rebuilt from your relays and servers, not synced between devices.
- **The media grid is not virtualized.** The list view is. Catalog operations are
  linear (~10µs per asset; 50k assets project in about half a second), so the
  limit is DOM size in grid mode with a very large catalog, not the index.
- **Deleting files does not delete the Nostr events.** Bouquet issues no NIP-09
  deletion request. Posts referencing deleted files will show missing media, and
  both delete dialogs say so before you confirm.
- **Sync lists one event per file.** Where a file is referenced by several
  events, the list shows the first and does not yet let you page through the
  rest. Browse shows the full picture for that asset.
