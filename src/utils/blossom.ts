import axios, { AxiosProgressEvent } from 'axios';
import { BlobDescriptor, BlossomClient, EventTemplate, SignedEvent } from 'blossom-client-sdk';
import dayjs from 'dayjs';

const blossomUrlRegex = /https?:\/\/(?:www\.)?[^\s/]+\/([a-fA-F0-9]{64})(?:\.[a-zA-Z0-9]+)?/g;

export function extractHashesFromContent(text: string) {
  let match;
  const hashes = [];
  while ((match = blossomUrlRegex.exec(text)) !== null) {
    hashes.push(match[1]);
  }

  // TODO ADD nip96 hash extraction, e.g. for
  // https://nostrcheck.me/media/b7c6f6915cfa9a62fff6a1f02604de88c23c6c6c6d1b8f62c7cc10749f307e81/65991c7cf061c6aab117f8cbead91cdb4c2d5575e47cb9a787617ad066b56efd.mp4

  return hashes;
}

export function extractHashFromUrl(url: string) {
  let match;
  if ((match = blossomUrlRegex.exec(url)) !== null) {
    return match[1];
  }
}

export async function fetchBlossomList(
  serverUrl: string,
  pubkey: string,
  signEventTemplate: (template: EventTemplate) => Promise<SignedEvent>
): Promise<BlobDescriptor[]> {
  const listAuthEvent = await BlossomClient.getListAuth(signEventTemplate, 'List Blobs');
  const blobs = await BlossomClient.listBlobs(serverUrl, pubkey!, undefined, listAuthEvent);

  // fallback to deprecated created attibute for servers that are not using 'uploaded' yet
  return blobs.map(b => ({ ...b, uploaded: b.uploaded || b.created || dayjs().unix() }));
}

export const uploadBlossomBlob = async (
  server: string,
  file: File,
  signEventTemplate: (template: EventTemplate) => Promise<SignedEvent>,
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void
) => {
  const uploadAuth = await BlossomClient.getUploadAuth(file, signEventTemplate, 'Upload Blob');

  const headers = {
    Accept: 'application/json',
    'Content-Type': file.type,
  };

  const res = await axios.put<BlobDescriptor>(`${server}/upload`, file, {
    headers: uploadAuth ? { ...headers, authorization: BlossomClient.encodeAuthorizationHeader(uploadAuth) } : headers,
    onUploadProgress,
  });

  return res.data;
};

export const downloadBlossomBlob = async (
  url: string,
  onDownloadProgress?: (progressEvent: AxiosProgressEvent) => void
) => {
  const response = await axios.get(url, {
    responseType: 'blob',
    onDownloadProgress,
  });

  return { data: response.data, type: response.headers['Content-Type']?.toString() };
};

export const mirrordBlossomBlob = async (
  targetServer: string,
  sourceUrl: string,
  signEventTemplate: (template: EventTemplate) => Promise<SignedEvent>
) => {
  console.log({ sourceUrl });
  const hash = extractHashFromUrl(sourceUrl);
  if (!hash) throw 'The soureUrl does not contain a blossom hash.';

  const blossomClient = new BlossomClient(targetServer, signEventTemplate);
  const mirrorAuth = await blossomClient.getMirrorAuth(hash, 'Upload Blob');

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
    }
  );
  return res.data;
};
