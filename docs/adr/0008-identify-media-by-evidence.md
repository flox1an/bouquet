# A file's type and name come from evidence, in order; a hash is not a name

A Blossom server stores a file under its hash and types most of them
`application/octet-stream` — in the catalog that prompted this, 3 726 of 6 707 blobs.
Trusting the server's mime left a third of Browse typed `unknown`, with no icon and no
thumbnail, and trusting the URL's file name printed a truncated sha256 as the title of
almost every item.

Type and format are resolved from the strongest available evidence, in this order:
sniffed content bytes, the server's reported mime, the mime an event declared, the URL
extension. A mime is "generic" (`application/octet-stream` and friends, `text/plain`)
and therefore weaker than an extension. Every projection carries the resolved
`displayMimeType` and a short `displayKindLabel` — "MP4 video", "HLS video",
"Unclassified file" — so an item that has no name can still say what it is.

A file name equal to the file's own hash is not a name: it is marked as a fallback
title and the kind label stands in for it, with a short hash shown beside it for
identification. `Unclassified file` is reserved for files no evidence has explained
yet; it is an honest state, not a failure.

Content sniffing costs one range request per file, so it is both prioritised and
bounded. What a card is showing is read first; a background sweep works through
everything else, smallest first, because a playlist is text and text is small. Files
already folded into another item (a video's segments) are skipped — nothing on screen
depends on knowing what they are, and skipping them removed two thirds of the queue in
a real catalog. Each outcome is stored as a versioned extractor result, so the sweep
is resumable, never repeats a read, and re-reads everything once when the sniffer
learns a new format.

A sniff that proves a type writes it onto the blob record, not only as a fact: the
catalog's own questions ("which of my files are playlists?") read the blob. A sniff
that proves nothing records nothing — storing the server's `application/octet-stream`
back as a content fact only launders a shrug into evidence.

Any enrichment that learns something must mark the profile mutated. The projection
skips itself unless `lastMutationAt > lastProjectedAt`, so without that stamp a file
whose type was just proved kept showing as unclassified until some unrelated write
happened to move the stamp. `catalog.test.ts` pins this with an unforced projection.

Consequences: the same blob may be typed differently over time as better evidence
arrives, and the timeline reprojects when it does. An extension no table maps is shown
verbatim as a format ("AAF file") rather than being flattened to "Unclassified"; host
placeholders (`.bin`, `.dat`) are not treated as formats. Encrypted uploads stay
"Unclassified file" forever — high-entropy bytes match no format, and 843 of them in
the catalog that prompted this are exactly that, not a detection failure.
