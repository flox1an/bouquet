import axios, { type AxiosError, type AxiosProgressEvent } from 'axios';
import type { BlobDescriptor, SignedEvent } from 'blossom-client-sdk';
import { encodeAuthorizationHeader } from 'blossom-client-sdk/auth';

/**
 * Formats an axios upload error into a human-readable message, surfacing the
 * HTTP status and any server-provided message.
 */
export function formatUploadError(error: AxiosError): string {
  const status = error.response?.status;
  const response = error.response?.data as { message?: string } | undefined;
  const responseMessage = response?.message;

  if (status === 403) return `Forbidden (403)${responseMessage ? `: ${responseMessage}` : ''}`;
  if (status === 401) return `Unauthorized (401)${responseMessage ? `: ${responseMessage}` : ''}`;
  if (status === 404) return `Not found (404)${responseMessage ? `: ${responseMessage}` : ''}`;
  if (status && status >= 500) return `Server error (${status})${responseMessage ? `: ${responseMessage}` : ''}`;

  return responseMessage ? `${error.message}: ${responseMessage}` : error.message;
}

/**
 * Uploads a single file to a Blossom server via PUT, optionally with a Blossom
 * auth event and upload-progress callback.
 */
export async function uploadBlob(
  server: string,
  file: File,
  auth?: SignedEvent,
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void,
  signal?: AbortSignal
): Promise<BlobDescriptor> {
  const headers = {
    Accept: 'application/json',
    'Content-Type': file.type,
  };

  const res = await axios.put<BlobDescriptor>(`${server}/upload`, file, {
    headers: auth ? { ...headers, authorization: encodeAuthorizationHeader(auth) } : headers,
    onUploadProgress,
    signal,
  });

  return res.data;
}
