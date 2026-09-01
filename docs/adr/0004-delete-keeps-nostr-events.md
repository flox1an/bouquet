# Deleting files never deletes Nostr events

Delete removes blobs from media servers only. Bouquet issues no NIP-09 deletion request and does not delete the file-metadata events that reference the blobs. Posts using a deleted file will show missing media.

This is deliberate scope, not an oversight: deleting a blob is reversible in effect only for the file, while deleting events mutates the user's public Nostr history — a strictly more destructive action with different blast radius. Both delete dialogs state the consequence before confirmation. If event deletion is ever added, it must be a separate, explicitly confirmed action, never bundled into file deletion.
