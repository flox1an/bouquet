/**
 * The two mime classifications the catalog reasons about, in one place because the
 * store, the projection and the browse hooks must agree on them.
 */

/** "This file lists other files", so its contents fold into one item (ADR-0009). */
export const PLAYLIST_MIME_TYPES: Record<string, true> = {
  'application/vnd.apple.mpegurl': true,
  'application/x-mpegurl': true,
  'audio/mpegurl': true,
  'audio/x-mpegurl': true,
};

/**
 * Mimes that say nothing about content. A server reporting one of these is not
 * evidence of a type, so weaker signals - the URL extension, the file's own first
 * bytes - are allowed to overrule it (ADR-0008).
 */
export const GENERIC_MIME_TYPES: Record<string, true> = {
  'application/octet-stream': true,
  'binary/octet-stream': true,
  'application/binary': true,
  'application/x-binary': true,
  'text/plain': true,
};

export function isGenericMimeType(mimeType: string | undefined): boolean {
  const mime = mimeType?.split(';', 1)[0]?.trim().toLocaleLowerCase();
  return !mime || GENERIC_MIME_TYPES[mime] === true;
}
