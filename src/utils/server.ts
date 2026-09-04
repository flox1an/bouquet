import type { AxiosProgressEvent } from 'axios';
import type { BlobDescriptor, EventTemplate, SignedEvent } from 'blossom-client-sdk';
import { createDeleteAuth } from 'blossom-client-sdk/auth';
import { deleteBlob } from 'blossom-client-sdk/actions/delete';
import { checkBlobExists, fetchBlossomList, mirrordBlossomBlob, uploadBlossomBlob } from './blossom';
import { deleteNip96File, fetchNip96List, uploadNip96File } from './nip96';
import type { Server } from './useUserServers';

export type ServerListProgress = {
  blobs: BlobDescriptor[];
  cursor?: string;
  received: number;
  state: 'pending' | 'complete' | 'failed';
  error?: string;
};

export type MediaServerErrorKind = 'unsupported' | 'not-found' | 'auth' | 'network' | 'server';

export class MediaServerError extends Error {
  constructor(
    readonly kind: MediaServerErrorKind,
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
  }
}

export const normalizeMediaServerError = (error: unknown): MediaServerError => {
  if (error instanceof MediaServerError) return error;
  const status = (error as { response?: { status?: number }; status?: number })?.response?.status ??
    (error as { status?: number })?.status;
  const kind: MediaServerErrorKind =
    status === 404 || status === 410 ? 'not-found' : status === 401 || status === 403 ? 'auth' : status && status >= 500 ? 'server' : 'network';
  return new MediaServerError(kind, error instanceof Error ? error.message : String(error), error);
};

export type MediaServerCapabilities = { list: boolean; upload: boolean; exists: boolean; mirror: boolean; delete: boolean };
export type MediaServer = {
  source: Server;
  capabilities: MediaServerCapabilities;
  list(pubkey: string, sign: (template: EventTemplate) => Promise<SignedEvent>, onProgress?: (progress: ServerListProgress) => void | Promise<void>): Promise<BlobDescriptor[]>;
  upload(file: File, filename: string, sign: (template: EventTemplate) => Promise<SignedEvent>, onProgress?: (progress: AxiosProgressEvent) => void, signal?: AbortSignal): Promise<BlobDescriptor>;
  exists(hash: string): Promise<BlobDescriptor | null>;
  mirror(sourceUrl: string, sign: (template: EventTemplate) => Promise<SignedEvent>, signal?: AbortSignal): Promise<BlobDescriptor>;
  delete(hash: string, sign: (template: EventTemplate) => Promise<SignedEvent>): Promise<void>;
};

const unsupported = (operation: string) => {
  throw new MediaServerError('unsupported', `Server does not support ${operation}`);
};

export const mediaServer = (source: Server): MediaServer => {
  if (source.type === 'blossom') {
    return {
      source,
      capabilities: { list: true, upload: true, exists: true, mirror: true, delete: true },
      list: (pubkey, sign, onProgress) => fetchBlossomList(source.url, pubkey, sign, onProgress),
      upload: (file, _filename, sign, onProgress, signal) => uploadBlossomBlob(source.url, file, sign, onProgress, signal),
      exists: hash => checkBlobExists(source.url, hash),
      mirror: (sourceUrl, sign, signal) => mirrordBlossomBlob(source.url, sourceUrl, sign, signal),
      delete: async (hash, sign) => {
        const auth = await createDeleteAuth(sign, hash);
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
    capabilities: { list: true, upload: true, exists: false, mirror: false, delete: true },
    list: (_pubkey, sign, onProgress) => fetchNip96List(source, sign, onProgress),
    upload: (file, filename, sign, onProgress, signal) => uploadNip96File(source, file, filename, sign, onProgress, signal),
    exists: () => unsupported('existence checks'),
    mirror: () => unsupported('mirroring'),
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
