import type { AxiosProgressEvent } from 'axios';
import type { BlobDescriptor, EventTemplate, SignedEvent } from 'blossom-client-sdk';
import { createDeleteAuth } from 'blossom-client-sdk/auth';
import { deleteBlob } from 'blossom-client-sdk/actions/delete';
import type { NostrEvent } from 'nostr-tools';
import { checkBlobExists, fetchBlossomList, mirrordBlossomBlob, reportBlobs, uploadBlossomBlob } from './blossom';
import { deleteNip96File, fetchNip96List, uploadNip96File } from './nip96';
import type { Server } from './useUserServers';

export type ServerListProgress = {
  blobs: BlobDescriptor[];
  cursor?: string;
  received: number;
  state: 'pending' | 'complete' | 'failed';
  error?: string;
};

export type MediaServerErrorKind = 'unsupported' | 'not-found' | 'auth' | 'conflict' | 'rate_limited' | 'network' | 'server';

export class MediaServerError extends Error {
  constructor(
    readonly kind: MediaServerErrorKind,
    message: string,
    readonly cause?: unknown,
    readonly status?: number
  ) {
    super(message);
  }
}

export const normalizeMediaServerError = (error: unknown): MediaServerError => {
  if (error instanceof MediaServerError) return error;
  const status = (error as { response?: { status?: number }; status?: number })?.response?.status ??
    (error as { status?: number })?.status;
  const kind: MediaServerErrorKind =
    status === 404 || status === 410
      ? 'not-found'
      : status === 401 || status === 403
        ? 'auth'
        : status === 409
          ? 'conflict'
          : status === 429
            ? 'rate_limited'
            : status === 405 || status === 501
              ? 'unsupported'
              : status && status >= 500
                ? 'server'
                : 'network';
  return new MediaServerError(kind, error instanceof Error ? error.message : String(error), error, status);
};

export type MediaServerCapabilities = {
  list: boolean;
  upload: boolean;
  exists: boolean;
  mirror: boolean;
  delete: boolean;
  report: boolean;
};
export type MediaServer = {
  source: Server;
  capabilities: MediaServerCapabilities;
  list(pubkey: string, sign: (template: EventTemplate) => Promise<SignedEvent>, onProgress?: (progress: ServerListProgress) => void | Promise<void>): Promise<BlobDescriptor[]>;
  upload(file: File, filename: string, sign: (template: EventTemplate) => Promise<SignedEvent>, onProgress?: (progress: AxiosProgressEvent) => void, signal?: AbortSignal): Promise<BlobDescriptor>;
  mirror(sourceUrl: string, sign: (template: EventTemplate) => Promise<SignedEvent>, signal?: AbortSignal): Promise<BlobDescriptor>;
  exists(hash: string): Promise<BlobDescriptor | null>;
  report(event: NostrEvent): Promise<void>;
  delete(hash: string, sign: (template: EventTemplate) => Promise<SignedEvent>): Promise<void>;
};

const unsupported = (operation: string) => {
  throw new MediaServerError('unsupported', `Server does not support ${operation}`);
};

/** Raw HTTP statuses stop at this seam: callers see MediaServerError kinds only. */
const guard = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    throw normalizeMediaServerError(error);
  }
};

export const mediaServer = (source: Server): MediaServer => {
  if (source.type === 'blossom') {
    return {
      source,
      capabilities: { list: true, upload: true, exists: true, mirror: true, delete: true, report: true },
      list: (pubkey, sign, onProgress) => guard(() => fetchBlossomList(source.url, pubkey, sign, onProgress)),
      upload: (file, _filename, sign, onProgress, signal) =>
        guard(() => uploadBlossomBlob(source.url, file, sign, onProgress, signal)),
      exists: hash => guard(() => checkBlobExists(source.url, hash)),
      mirror: (sourceUrl, sign, signal) => guard(() => mirrordBlossomBlob(source.url, sourceUrl, sign, signal)),
      report: event => guard(() => reportBlobs(source.url, event)),
      delete: async (hash, sign) => {
        const auth = await createDeleteAuth(sign, hash, { servers: [new URL(source.url).hostname.toLowerCase()] });
        try {
          await deleteBlob(source.url, hash, { auth });
        } catch (error) {
          throw normalizeMediaServerError(error);
        }
      },
    };
  }

  return {
    source,
    capabilities: { list: true, upload: true, exists: false, mirror: false, delete: true, report: false },
    list: (_pubkey, sign, onProgress) => guard(() => fetchNip96List(source, sign, onProgress)),
    upload: (file, filename, sign, onProgress, signal) =>
      guard(() => uploadNip96File(source, file, filename, sign, onProgress, signal)),
    exists: async () => unsupported('existence checks'),
    mirror: async () => unsupported('mirroring'),
    report: async () => unsupported('reports'),
    delete: async (hash, sign) => {
      try {
        await deleteNip96File(source, hash, sign);
      } catch (error) {
        throw normalizeMediaServerError(error);
      }
    },
  };
};

export const syncServerList = async (
  server: Pick<MediaServer, 'list' | 'source'>,
  pubkey: string,
  sign: (template: EventTemplate) => Promise<SignedEvent>,
  ingest: (progress: ServerListProgress & { full?: boolean }) => void | Promise<void>
): Promise<BlobDescriptor[]> => {
  const blobs = await server.list(pubkey, sign, progress => ingest(progress));
  await ingest({ blobs, received: blobs.length, state: 'complete', full: true });
  return blobs;
};
