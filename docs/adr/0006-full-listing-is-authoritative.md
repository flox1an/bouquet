# A full server listing is authoritative for presence; probe failures never are

The catalog records presence observations from many sources, and absence alone is normally a time-bound observation, not removal. One exception is deliberate: when a server returns its *complete* blob listing (`ingestServerList` with `full: true`, produced by a rescan), blobs recorded present on that server but missing from the listing are marked absent with reason `rescan` — the same authoritative evidence class as a direct delete. Partial pages, in-progress syncs, and probe failures never remove presence.

This is what makes files deleted directly on a server (outside the app) disappear on rescan, instead of lingering as present forever. The `full` flag is the seam's guardrail: removing it would make every interrupted page-wise sync mass-delete presence records, which is exactly the failure the flag exists to prevent.
