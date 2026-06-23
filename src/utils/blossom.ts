import axios, { AxiosProgressEvent } from 'axios';
import { BlobDescriptor, EventTemplate, SignedEvent, getBlobSha256 } from 'blossom-client-sdk';
import { createListAuth, createUploadAuth, createMirrorAuth, encodeAuthorizationHeader } from 'blossom-client-sdk/auth';
import { listBlobs } from 'blossom-client-sdk/actions/list';
import dayjs from 'dayjs';

const blossomUrlRegex = /https?:\/\/(?:www\.)?[^\s/]+\/([a-fA-F0-9]{64})(?:\.[a-zA-Z0-9]+)?/g;

export function extractHashesFromContent(text: string) {
  let match;
  const hashes = [];
  blossomUrlRegex.lastIndex = 0;
  while ((match = blossomUrlRegex.exec(text)) !== null) {
    hashes.push(match[1]);
  }

  // TODO ADD nip96 hash extraction, e.g. for
  // https://nostrcheck.me/media/b7c6f6915cfa9a62fff6a1f02604de88c23c6c6c6d1b8f62c7cc10749f307e81/65991c7cf061c6aab117f8cbead91cdb4c2d5575e47cb9a787617ad066b56efd.mp4

  return hashes;
}

export function extractHashFromUrl(url: string) {
  blossomUrlRegex.lastIndex = 0;
  const match = blossomUrlRegex.exec(url);
  if (match) {
    return match[1];
  }
}

export async function fetchBlossomList(
  serverUrl: string,
  pubkey: string,
  signEventTemplate: (template: EventTemplate) => Promise<SignedEvent>
): Promise<BlobDescriptor[]> {
  const listAuthEvent = await createListAuth(signEventTemplate);

  // Fetch all pages by iterating through results
  // Most servers paginate by returning the most recent blobs first
  // We'll fetch pages until we get an empty response or see duplicate blobs
  let allBlobs: BlobDescriptor[] = [];
  let until: number | undefined = undefined;
  let hasMore = true;
  const seenHashes = new Set<string>();
  let previousBatchSize = 0;

  while (hasMore) {
    const options: any = { auth: listAuthEvent };
    if (until !== undefined) {
      options.until = until;
    }

    let blobs: BlobDescriptor[];
    try {
      blobs = await listBlobs(serverUrl, pubkey!, options);
    } catch (err) {
      // The list endpoint is optional in Blossom (BUD-02). Some servers disable
      // it (e.g. responding 404 with "List endpoint is disabled on this server")
      // while still supporting upload/download/mirror. Treat that as "no listable
      // blobs" instead of a connection error so the server stays usable.
      if ((err as { status?: number })?.status === 404) {
        hasMore = false;
        break;
      }
      throw err;
    }

    // Stop if we got no results
    if (blobs.length === 0) {
      hasMore = false;
      break;
    }

    // Filter out any duplicates (shouldn't happen but be safe)
    const newBlobs = blobs.filter(b => !seenHashes.has(b.sha256));

    // Stop if all blobs in this batch were duplicates
    if (newBlobs.length === 0) {
      hasMore = false;
      break;
    }

    // Add new blobs to our collection
    newBlobs.forEach(b => seenHashes.add(b.sha256));
    allBlobs = [...allBlobs, ...newBlobs];

    // If this batch is smaller than the previous one, we're likely at the end
    // Also stop if we got very few results (likely the last page)
    if (newBlobs.length < 10 || (previousBatchSize > 0 && newBlobs.length < previousBatchSize * 0.5)) {
      hasMore = false;
      break;
    }

    previousBatchSize = newBlobs.length;

    // Find the oldest blob in this batch to use as 'until' for next page
    const oldestUpload = Math.min(...newBlobs.map(b => b.uploaded || 0));

    // Stop if we got invalid timestamps
    if (oldestUpload === 0 || (until !== undefined && oldestUpload >= until)) {
      hasMore = false;
    } else {
      // Set 'until' to just before the oldest timestamp to get the next page
      until = oldestUpload;
    }
  }

  // fallback to deprecated created attibute for servers that are not using 'uploaded' yet
  return allBlobs.map(b => ({ ...b, uploaded: b.uploaded || dayjs().unix() }));
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
  console.log({ sourceUrl, hash });
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
      headers: mirrorAuth
        ? { ...headers, authorization: encodeAuthorizationHeader(mirrorAuth) }
        : headers,
      signal,
    }
  );
  return res.data;
};
