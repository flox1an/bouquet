const EVENT_KIND_LABELS: Record<number, string> = {
  1: 'Note',
  20: 'Picture',
  21: 'Video',
  22: 'Short video',
  1063: 'File',
  31337: 'Track',
  34235: 'Video',
  34236: 'Short video',
};

export function eventKindLabel(kind: number | undefined): string {
  if (kind === undefined) return 'Unlinked file';
  return EVENT_KIND_LABELS[kind] ?? `Kind ${kind}`;
}

export function fallbackEventTitle(kind: number | undefined): string {
  const label = eventKindLabel(kind);
  return kind === undefined ? label : `Untitled ${label.toLocaleLowerCase()}`;
}
