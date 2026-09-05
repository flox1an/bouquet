import axios, { type AxiosError, type AxiosProgressEvent } from 'axios';
import { BlobDescriptor, EventTemplate, SignedEvent } from 'blossom-client-sdk';
import { downloadBlossomBlob } from './blossom';
import { mediaServer, MediaServerError } from './server';
import { Server } from './useUserServers';

export type TransferPhase = 'validating' | 'mirroring' | 'downloading' | 'uploading' | 'completed' | 'error';

export interface TransferOptions {
  signal?: AbortSignal;
  timeout?: number;
  onPhaseChange?: (phase: TransferPhase) => void;
  onProgress?: (progressEvent: AxiosProgressEvent) => void;
  maxRetries?: number;
  allowMirror?: boolean;
  onMirrorUnsupported?: () => void;
  onCompleted?: (blob: BlobDescriptor, method: 'mirror' | 'upload') => void | Promise<void>;
}

class SourceBlobNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceBlobNotFoundError';
  }
}

async function blobUrlToFile(blobUrl: string, fileName: string): Promise<File> {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  const fileOptions = { type: blob.type, lastModified: Date.now() };
  return new File([blob], fileName, fileOptions);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('Operation timed out')), timeoutMs);
      signal?.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        reject(new Error('Operation cancelled'));
      });
    }),
  ]);
}

async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries: number, signal?: AbortSignal): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      throw new Error('Operation cancelled');
    }
    try {
      return await fn();
    } catch (e: any) {
      lastError = e;
      if (attempt < maxRetries) {
        const isRetryable =
          e.code === 'ECONNRESET' ||
          e.code === 'ETIMEDOUT' ||
          e.message?.includes('timeout') ||
          e.message?.includes('Network Error') ||
          (e.response?.status && e.response.status >= 500);

        if (!isRetryable) {
          throw e;
        }

        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

export const transferBlob = async (
  sourceUrl: string,
  targetServer: Server,
  signEventTemplate: (template: EventTemplate) => Promise<SignedEvent>,
  options: TransferOptions = {}
): Promise<BlobDescriptor> => {
  const {
    signal,
    timeout = 60000,
    onPhaseChange,
    onProgress,
    maxRetries = 2,
    allowMirror = true,
    onMirrorUnsupported,
    onCompleted,
  } = options;
  const target = mediaServer(targetServer);

  if (signal?.aborted) {
    throw new Error('Transfer cancelled');
  }

  onPhaseChange?.('validating');
  try {
    await withTimeout(axios.head(sourceUrl, { signal }), timeout, signal);
  } catch (error) {
    const e = error as AxiosError;
    const status = e.response?.status;
    // Treat only hard 404/410 as definitive missing source blobs.
    if (status === 404 || status === 410) {
      throw new SourceBlobNotFoundError('Source file is missing (not found on origin server).');
    }
  }

  if (sourceUrl.startsWith('blob:')) {
    const file = await blobUrlToFile(sourceUrl, 'cover.jpg');
    onPhaseChange?.('uploading');

    const uploadFn = () => target.upload(file, 'cover.jpg', signEventTemplate, onProgress, signal);

    const result = await withTimeout(retryWithBackoff(uploadFn, maxRetries, signal), timeout, signal);
    onPhaseChange?.('completed');
    await onCompleted?.(result, 'upload');
    return result;
  } else {
    if (target.capabilities.mirror && allowMirror) {
      try {
        onPhaseChange?.('mirroring');
        const mirrorFn = () => target.mirror(sourceUrl, signEventTemplate, signal);
        const blob = await withTimeout(retryWithBackoff(mirrorFn, maxRetries, signal), timeout, signal);
        onProgress?.({
          loaded: blob.size,
          bytes: blob.size,
          lengthComputable: true,
        });
        onPhaseChange?.('completed');
        await onCompleted?.(blob, 'mirror');
        return blob;
      } catch (e) {
        if (signal?.aborted || (e instanceof Error && e.message?.includes('cancelled'))) {
          throw e;
        }
        // The seam already decoded the status: these kinds mean this server will
        // not take a mirror, whatever the transport reported.
        if (e instanceof MediaServerError && (e.kind === 'unsupported' || e.kind === 'not-found')) {
          onMirrorUnsupported?.();
        }
      }
    }

    onPhaseChange?.('downloading');
    const downloadFn = () => downloadBlossomBlob(sourceUrl, onProgress, signal);
    const result = await withTimeout(retryWithBackoff(downloadFn, maxRetries, signal), timeout, signal);

    const fileName = sourceUrl.replace(/.*\//, '');
    const file = new File([result.data], fileName, { type: result.type, lastModified: new Date().getTime() });

    onPhaseChange?.('uploading');
    const uploadFn = () => target.upload(file, fileName, signEventTemplate, onProgress, signal);

    const uploadResult = await withTimeout(retryWithBackoff(uploadFn, maxRetries, signal), timeout, signal);
    onPhaseChange?.('completed');
    await onCompleted?.(uploadResult, 'upload');
    return uploadResult;
  }
};
