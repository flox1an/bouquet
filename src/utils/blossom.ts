import axios, { AxiosProgressEvent } from 'axios';
import { BlobDescriptor, EventTemplate, SignedEvent, getBlobSha256 } from 'blossom-client-sdk';
import { createListAuth, createUploadAuth, createMirrorAuth, encodeAuthorizationHeader } from 'blossom-client-sdk/auth';
import { listBlobs } from 'blossom-client-sdk/actions/list';
import dayjs from 'dayjs';

const blossomUrlRegex = /https?:\/\/(?:www\.)?[^\s/]+\/([a-fA-F0-9]{64})(?:\.[a-zA-Z0-9]+)?/g;
const nip96UrlRegex = /https?:\/\/(?:www\.)?[^\s/]+\/media\/[a-fA-F0-9]{64}\/([a-fA-F0-9]{64})(?:\.[a-zA-Z0-9]+)?/g;
const genericUrlRegex = /https?:\/\/[^\s<>"']+/g;

export function extractHashesFromContent(text: string) {
  let match;
  const hashes = [];
  blossomUrlRegex.lastIndex = 0;
  while ((match = blossomUrlRegex.exec(text)) !== null) {
    hashes.push(match[1]);
  }
  nip96UrlRegex.lastIndex = 0;
  while ((match = nip96UrlRegex.exec(text)) !== null) {
    hashes.push(match[1]);
  }
  return hashes;
}

export function extractHashFromUrl(url: string) {
  blossomUrlRegex.lastIndex = 0;
  let match = blossomUrlRegex.exec(url);
  if (match) return match[1];
  nip96UrlRegex.lastIndex = 0;
  match = nip96UrlRegex.exec(url);
  if (match) return match[1];
}

/** Extract all https?:// URLs from text, deduplicated. */
export function extractUrlsFromText(text: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  genericUrlRegex.lastIndex = 0;
  let match;
  while ((match = genericUrlRegex.exec(text)) !== null) {
    const url = match[0].replace(/[.,;:!?)'"\]]+$/, '');
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }
  return urls;
}

export type BlossomListProgress = {
  blobs: BlobDescriptor[];
  cursor?: string;
  received: number;
  state: 'pending' | 'complete' | 'failed';
  error?: string;
};

const BLOSSOM_LIST_PAGE_SIZE = 100;

export type BlossomListPageLoader = (cursor: string | undefined) => Promise<BlobDescriptor[]>;

export async function fetchBlossomList(
  serverUrl: string,
  pubkey: string,
  signEventTemplate: (template: EventTemplate) => Promise<SignedEvent>,
  onProgress?: (progress: BlossomListProgress) => Promise<void> | void
): Promise<BlobDescriptor[]> {
  const listAuthEvent = await createListAuth(signEventTemplate);
  return collectBlossomListPages(
    cursor => listBlobs(serverUrl, pubkey, { auth: listAuthEvent, cursor, limit: BLOSSOM_LIST_PAGE_SIZE }),
    onProgress,
    BLOSSOM_LIST_PAGE_SIZE
  );
}

export async function collectBlossomListPages(
  loadPage: BlossomListPageLoader,
  onProgress?: (progress: BlossomListProgress) => Promise<void> | void,
  expectedPageSize?: number
): Promise<BlobDescriptor[]> {
  const allBlobs: BlobDescriptor[] = [];
  const seenHashes = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  try {
    while (true) {
      const page = await loadPage(cursor);
      if (page.length === 0) break;

      // Detect servers that ignore the limit parameter and return the full list.
      // If the page exceeds the expected size, treat it as a complete dump.
      if (expectedPageSize !== undefined && page.length > expectedPageSize) {
        const newBlobs = page.filter(blob => !seenHashes.has(blob.sha256));
        for (const blob of newBlobs) seenHashes.add(blob.sha256);
        allBlobs.push(...newBlobs);
        await onProgress?.({ blobs: newBlobs, state: 'complete', received: allBlobs.length });
        return allBlobs.map(blob => ({ ...blob, uploaded: blob.uploaded || dayjs().unix() }));
      }

      const nextCursor = page.at(-1)?.sha256;
      if (!nextCursor || seenCursors.has(nextCursor)) {
        throw new Error('Blossom list returned a non-advancing cursor');
      }
      seenCursors.add(nextCursor);

      const newBlobs = page.filter(blob => !seenHashes.has(blob.sha256));
      for (const blob of newBlobs) seenHashes.add(blob.sha256);
      allBlobs.push(...newBlobs);
      cursor = nextCursor;

      await onProgress?.({ blobs: newBlobs, cursor, state: 'pending', received: allBlobs.length });
    }
  } catch (error) {
    await onProgress?.({
      blobs: [],
      cursor,
      state: 'failed',
      received: allBlobs.length,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  await onProgress?.({ blobs: [], state: 'complete', received: allBlobs.length });
  return allBlobs.map(blob => ({ ...blob, uploaded: blob.uploaded || dayjs().unix() }));
}

/**
 * Calculate SHA-256 hash of a file
 */
export const calculateFileHash = async (file: File): Promise<string> => {
  return await getBlobSha256(file);
};

/**
 * Check if a blob exists on a server using HEAD request
 */
export const checkBlobExists = async (
  serverUrl: string,
  hash: string,
  auth?: SignedEvent
): Promise<BlobDescriptor | null> => {
  try {
    const headers: Record<string, string> = {};
    if (auth) {
      headers.authorization = encodeAuthorizationHeader(auth);
    }

    const response = await axios.head(`${serverUrl}/${hash}`, { headers });

    // If HEAD request succeeds, the blob exists
    // Construct a BlobDescriptor from the response headers
    const getHeaderValue = (name: string): string | undefined => {
      const value = response.headers[name] ?? response.headers[name.toLowerCase()];
      if (typeof value === 'string') return value;
      if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
      return undefined;
    };

    const contentType = getHeaderValue('content-type');
    const contentLength = getHeaderValue('content-length');

    return {
      url: `${serverUrl}/${hash}`,
      sha256: hash,
      size: contentLength ? parseInt(contentLength, 10) : 0,
      type: contentType || '',
      uploaded: dayjs().unix(), // We don't have this from HEAD, use current time
    };
  } catch {
    // If HEAD request fails (404, etc.), the blob doesn't exist
    return null;
  }
};

export const uploadBlossomBlob = async (
  server: string,
  file: File,
  signEventTemplate: (template: EventTemplate) => Promise<SignedEvent>,
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void,
  signal?: AbortSignal
) => {
  const uploadAuth = await createUploadAuth(signEventTemplate, file);

  const headers = {
    Accept: 'application/json',
    'Content-Type': file.type,
  };

  const res = await axios.put<BlobDescriptor>(`${server}/upload`, file, {
    headers: uploadAuth ? { ...headers, authorization: encodeAuthorizationHeader(uploadAuth) } : headers,
    onUploadProgress,
    signal,
  });

  return res.data;
};

export const downloadBlossomBlob = async (
  url: string,
  onDownloadProgress?: (progressEvent: AxiosProgressEvent) => void,
  signal?: AbortSignal
) => {
  const response = await axios.get(url, {
    responseType: 'blob',
    onDownloadProgress,
    signal,
  });

  return { data: response.data, type: response.headers['Content-Type']?.toString() };
};

export const mirrordBlossomBlob = async (
  targetServer: string,
  sourceUrl: string,
  signEventTemplate: (template: EventTemplate) => Promise<SignedEvent>,
  signal?: AbortSignal
) => {
  const hash = extractHashFromUrl(sourceUrl);

  if (!hash) throw 'The soureUrl does not contain a blossom hash.';

  const mirrorAuth = await createMirrorAuth(signEventTemplate, hash);

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  const res = await axios.put<BlobDescriptor>(
    `${targetServer}/mirror`,
    { url: sourceUrl },
    {
      headers: mirrorAuth ? { ...headers, authorization: encodeAuthorizationHeader(mirrorAuth) } : headers,
      signal,
    }
  );
  return res.data;
};
