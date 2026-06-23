import axios, { AxiosError, AxiosProgressEvent } from 'axios';
import { BlobDescriptor, EventTemplate, SignedEvent } from 'blossom-client-sdk';
import { downloadBlossomBlob, mirrordBlossomBlob, uploadBlossomBlob } from './blossom';
import { Server } from './useUserServers';
import { uploadNip96File } from './nip96';

export type TransferPhase = 'validating' | 'mirroring' | 'downloading' | 'uploading' | 'completed' | 'error';

export interface TransferOptions {
  signal?: AbortSignal;
  timeout?: number;
  onPhaseChange?: (phase: TransferPhase) => void;
  onProgress?: (progressEvent: AxiosProgressEvent) => void;
  maxRetries?: number;
  allowMirror?: boolean;
  onMirrorUnsupported?: () => void;
  /** Known sha256 of the source blob, used for the mirror auth `x` tag. */
  sourceSha256?: string;
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

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  signal?: AbortSignal
): Promise<T> {
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
        const isRetryable = e.code === 'ECONNRESET' || 
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
    sourceSha256,
  } = options;

  console.log({ sourceUrl, targetServer });

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
      throw new SourceBlobNotFoundError('Source blob is missing (not found on origin server).');
    }
  }

  if (sourceUrl.startsWith('blob:')) {
    const file = await blobUrlToFile(sourceUrl, 'cover.jpg');
    onPhaseChange?.('uploading');
    
    const uploadFn = () => targetServer.type == 'blossom'
      ? uploadBlossomBlob(targetServer.url, file, signEventTemplate, onProgress, signal)
      : uploadNip96File(targetServer, file, 'cover.jpg', signEventTemplate, onProgress, signal);

    const result = await withTimeout(
      retryWithBackoff(uploadFn, maxRetries, signal),
      timeout,
      signal
    );
    onPhaseChange?.('completed');
    return result;
  } else {
    if (targetServer.type == 'blossom' && allowMirror) {
      try {
        onPhaseChange?.('mirroring');
        const mirrorFn = () =>
          mirrordBlossomBlob(targetServer.url, sourceUrl, signEventTemplate, signal, sourceSha256);
        const blob = await withTimeout(
          retryWithBackoff(mirrorFn, maxRetries, signal),
          timeout,
          signal
        );
        onProgress?.({
          loaded: blob.size,
          bytes: blob.size,
          lengthComputable: true,
        });
        onPhaseChange?.('completed');
        return blob;
      } catch (e: any) {
        if (signal?.aborted || e.message?.includes('cancelled')) {
          throw e;
        }
        const status = e.response?.status;
        // Mirror endpoint unsupported or disabled on target server.
        if (status === 400 || status === 404 || status === 405 || status === 501) {
          onMirrorUnsupported?.();
        }
        console.log('Mirror failed. Using download + upload instead.', e.message);
      }
    }

    onPhaseChange?.('downloading');
    const downloadFn = () => downloadBlossomBlob(sourceUrl, onProgress, signal);
    const result = await withTimeout(
      retryWithBackoff(downloadFn, maxRetries, signal),
      timeout,
      signal
    );

    const fileName = sourceUrl.replace(/.*\//, '');
    const file = new File([result.data], fileName, { type: result.type, lastModified: new Date().getTime() });

    onPhaseChange?.('uploading');
    const uploadFn = () => targetServer.type == 'blossom'
      ? uploadBlossomBlob(targetServer.url, file, signEventTemplate, onProgress, signal)
      : uploadNip96File(targetServer, file, fileName, signEventTemplate, onProgress, signal);

    const uploadResult = await withTimeout(
      retryWithBackoff(uploadFn, maxRetries, signal),
      timeout,
      signal
    );
    onPhaseChange?.('completed');
    return uploadResult;
  }
};
