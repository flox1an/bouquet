import { BlobDescriptor, EventTemplate, SignedEvent } from 'blossom-client-sdk';
import { Server } from './useUserServers';
import dayjs from 'dayjs';
import axios, { AxiosProgressEvent } from 'axios';

type MediaTransformation = 'resizing' | 'format_conversion' | 'compression' | 'metadata_stripping';

interface Plan {
  name: string;
  is_nip98_required: boolean;
  url: string;
  max_byte_size: number;
  file_expiration: [number, number];
  media_transformations: {
    image: MediaTransformation[];
    video: MediaTransformation[];
  };
}

export interface Nip96ServerConfig {
  api_url: string;
  download_url: string;
  supported_nips: number[];
  tos_url: string;
  content_types: string[]; // MimeTypes
  plans: {
    [key: string]: Plan;
  };
}

interface Nip96BlobDescriptor {
  tags: string[][];
  content: string;
  created_at: number;
}

interface Nip96ListResponse {
  count: number; // server page size, eg. max(1, min(server_max_page_size, arg_count))
  total: number; // total number of files
  page: number; // the current page number
  files: Nip96BlobDescriptor[];
}

export async function fetchNip96ServerConfig(serverUrl: string): Promise<Nip96ServerConfig> {
  const response = await fetch(serverUrl + '/.well-known/nostr/nip96.json');
  return response.json();
}

type Nip96UploadResult = {
  status: 'success' | 'error';
  message: string;
  processing_url?: string;
  nip94_event?: {
    tags: string[][];
    content: string;
  };
  content: string;
};

const tenMinutesFromNow = () => dayjs().unix() + 10 * 60;

async function createNip98UploadAuthToken(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  signEventTemplate: (template: EventTemplate) => Promise<SignedEvent>
): Promise<string> {
  const authEvent = {
    created_at: dayjs().unix(),
    kind: 27235,
    content: '',
    tags: [
      ['u', url],
      ['method', method],
      ['expiration', `${tenMinutesFromNow()}`],
    ],
  };
  const signedEvent = await signEventTemplate(authEvent);
  return btoa(JSON.stringify(signedEvent));
}

const getValueByTag = (tags: string[][] | undefined, t: string) => tags && tags.find(v => v[0] == t)?.[1];

export async function fetchNip96List(
  server: Server,
  signEventTemplate: (template: EventTemplate) => Promise<SignedEvent>,
  onProgress?: (progressEvent: AxiosProgressEvent) => void
) {
  const page = 0;
  const count = 100;
  const baseUrl = server.nip96?.api_url || server.url;
  const listUrl = `${baseUrl}?page=${page}&count=${count}`;

  const response = await axios.get(listUrl, {
    headers: { Authorization: `Nostr ${await createNip98UploadAuthToken(listUrl, 'GET', signEventTemplate)}` },
    onDownloadProgress: onProgress,
  });

  const list = response.data as Nip96ListResponse;

  return list.files.map(
    file =>
      ({
        created: file.created_at * 1000,
        uploaded: file.created_at * 1000,
        type: getValueByTag(file.tags, 'm'),
        sha256: getValueByTag(file.tags, 'x'),
        size: parseInt(getValueByTag(file.tags, 'size') || '0', 10),
        url: getValueByTag(file.tags, 'url') || baseUrl + '/' + getValueByTag(file.tags, 'ox'),
      }) as BlobDescriptor
  );
}

/*
Upload
POST $api_url as multipart/form-data.

AUTH required

List of form fields:

file: REQUIRED the file to upload
caption: RECOMMENDED loose description;
expiration: UNIX timestamp in seconds. Empty string if file should be stored forever. The server isn't required to honor this.
size: File byte size. This is just a value the server can use to reject early if the file size exceeds the server limits.
alt: RECOMMENDED strict description text for visibility-impaired users.
media_type: "avatar" or "banner". Informs the server if the file will be used as an avatar or banner. If absent, the server will interpret it as a normal upload, without special treatment.
content_type: mime type such as "image/jpeg". This is just a value the server can use to reject early if the mime type isn't supported.
no_transform: "true" asks server not to transform the file and serve the uploaded file as is, may be rejected.
Others custom form data fields may be used depending on specific server support. The server isn't required to store any metadata sent by clients.

The filename embedded in the file may not be honored by the server, which could internally store just the SHA-256 hash value as the file name, ignoring extra metadata. The hash is enough to uniquely identify a file, that's why it will be used on the download and delete routes.

The server MUST link the user's pubkey string as the owner of the file so to later allow them to delete the file.

no_transform can be used to replicate a file to multiple servers for redundancy, clients can use the server list to find alternative servers which might contain the same file. When uploading a file and requesting no_transform clients should check that the hash matches in the response in order to detect if the file was modified.
*/

export async function uploadNip96File(
  server: Server,
  file: File,
  caption: string,
  signEventTemplate: (template: EventTemplate) => Promise<SignedEvent>,
  onProgress?: (progressEvent: AxiosProgressEvent) => void
): Promise<BlobDescriptor> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('caption', caption || ''); // RECOMMENDED TODO ADD
  //formData.append('expiration', server.expiration || '');
  formData.append('size', file.size.toString());
  formData.append('alt', caption || ''); // RECOMMENDED
  //formData.append('media_type',  // avatar / banner
  formData.append('content_type', file.type || '');
  formData.append('no_transform', 'true'); // we don't use any transform for blossom compatibility

  const baseUrl = server.nip96?.api_url || server.url;

  const response = await axios.post(baseUrl, formData, {
    headers: { Authorization: `Nostr ${await createNip98UploadAuthToken(baseUrl, 'POST', signEventTemplate)}` },
    onUploadProgress: onProgress,
  });

  if (response.status >= 400) {
    throw new Error(`Failed to upload file: ${response.statusText}`);
  }

  const result = response.data as Nip96UploadResult;
  console.log(result);

  const x = getValueByTag(result.nip94_event?.tags, 'x') || getValueByTag(result.nip94_event?.tags, 'ox');

  if (!x) {
    throw new Error('Failed to upload file: no sha256');
  }

  return {
    uploaded: dayjs().unix(), // todo fix
    type: getValueByTag(result.nip94_event?.tags, 'm'),
    sha256: x,
    size: parseInt(getValueByTag(result.nip94_event?.tags, 'size') || '0', 10),
    url:
      getValueByTag(result.nip94_event?.tags, 'url') || baseUrl + '/' + getValueByTag(result.nip94_event?.tags, 'ox'),
  };
}

/*
Deletion
DELETE $api_url/<sha256-hash>(.ext)

AUTH required

Note that the /<sha256-hash> part is from the original file, not from the transformed file if the uploaded file went through any server transformation.

The extension is optional as the file hash is the only needed file identification.

The server should reject deletes from users other than the original uploader with the appropriate http response code (403 Forbidden).

It should be noted that more than one user may have uploaded the same file (with the same hash). In this case, a delete must not really delete the file but just remove the user's pubkey from the file owners list (considering the server keeps just one copy of the same file, because multiple uploads of the same file results in the same file hash).

The successful response is a 200 OK one with just basic JSON fields:

{
  status: "success",
  message: "File deleted."
}

*/
export async function deleteNip96File(
  server: Server,
  sha256: string,
  signEventTemplate: (template: EventTemplate) => Promise<SignedEvent>
) {
  const baseUrl = server.nip96?.api_url || server.url;

  const url = `${baseUrl}/${sha256}`;
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  const auth = await createNip98UploadAuthToken(url, 'DELETE', signEventTemplate);

  const response = await axios.delete(url, {
    headers: {
      ...headers,
      authorization: `Nostr ${auth}`,
    },
  });

  if (response.status >= 400) {
    throw new Error(`Failed to delete file: ${response.statusText}`);
  }

  const result = response.data;
  if (result.status !== 'success') {
    throw new Error(`Failed to delete file: ${result.message}`);
  }

  return result.message;
}
