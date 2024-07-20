import { BlobDescriptor, BlossomClient, EventTemplate, SignedEvent } from 'blossom-client-sdk';
import dayjs from 'dayjs';

const blossomUrlRegex = /https?:\/\/(?:www\.)?[^\s/]+\/([a-fA-F0-9]{64})(?:\.[a-zA-Z0-9]+)?/g;

export function extractHashesFromContent(text: string) {
  let match;
  const hashes = [];
  while ((match = blossomUrlRegex.exec(text)) !== null) {
    hashes.push(match[1]);
  }
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
