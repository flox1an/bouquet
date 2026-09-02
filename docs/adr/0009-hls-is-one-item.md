# An HLS stream is one item; its segments are contents, not entries

A single video published as HLS is one playlist plus hundreds or thousands of segment
files. Listed individually they drown a timeline: one 58-minute video contributed 1 760
entries that read as anonymous binaries.

A playlist and everything it references — variant playlists, init segments, media
segments — project as one item. The parent link (`blob_relationship`) is what folds
them: a file that is any relationship's child never becomes an entry of its own, no
matter how the expansion ended. The projection reports `segmentCount` alongside
`blobCount` so the interface can say "1 playlist + 1 760 segments" instead of "1 761
files", and `displayDurationSeconds` from the summed `#EXTINF` of the longest variant.

Candidates come from the catalog, never from a server listing. A playlist known only
from an event or from another manifest appears in no listing at all — in a real
catalog 823 files were reachable only that way, so a listing-based scan left their
videos unexpanded and their segments loose. A file counts as a candidate when the
catalog says it is a playlist: a declared playlist mime, one its own bytes proved, or
an `.m3u8` URL. Everything a server typed generically is instead settled by the
identification sweep of ADR-0008, which reads the first bytes once and hands real
playlists back here.

A candidate is probed with one kilobyte; only a body beginning `#EXTM3U` is fetched in
full, and whether more remains is judged by the probe buffer being full rather than by
a `content-length` that some hosts report as the range's own length. Expansion is
version-stamped (`hls:<version>`); a version bump re-reads every file a previous
version found something in — never the ones it proved were not playlists.

Consequences: expansion beyond `maxDescendants` records the parent link only, skipping
membership and URL bookkeeping — the segment still folds into its video, but the item's
total size may under-count. Expansion is bounded to a few concurrent runs process-wide
and announces a catalog change only when it actually expanded something; without that,
a first sync reprojects the whole catalog thousands of times.
