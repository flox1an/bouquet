import axios, { AxiosProgressEvent } from 'axios';
import { BlobDescriptor, BlossomClient, EventTemplate, SignedEvent } from 'blossom-client-sdk';
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
  const listAuthEvent = await BlossomClient.createListAuth(signEventTemplate);
  
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
    
    const blobs = await BlossomClient.listBlobs(serverUrl, pubkey!, options);
    
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

export const uploadBlossomBlob = async (
  server: string,
  file: File,
  signEventTemplate: (template: EventTemplate) => Promise<SignedEvent>,
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void,
  signal?: AbortSignal
) => {
  const uploadAuth = await BlossomClient.createUploadAuth(signEventTemplate, file);

  const headers = {
    Accept: 'application/json',
    'Content-Type': file.type,
  };

  const res = await axios.put<BlobDescriptor>(`${server}/upload`, file, {
    headers: uploadAuth ? { ...headers, authorization: BlossomClient.encodeAuthorizationHeader(uploadAuth) } : headers,
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

  const blossomClient = new BlossomClient(targetServer, signEventTemplate);
  const mirrorAuth = await blossomClient.createMirrorAuth(hash);

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  const res = await axios.put<BlobDescriptor>(
    `${targetServer}/mirror`,
    { url: sourceUrl },
    {
      headers: mirrorAuth
        ? { ...headers, authorization: BlossomClient.encodeAuthorizationHeader(mirrorAuth) }
        : headers,
      signal,
    }
  );
  return res.data;
};
