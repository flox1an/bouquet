import { BlobDescriptor, EventTemplate, SignedEvent } from 'blossom-client-sdk';
import { Server } from './useUserServers';
import dayjs from 'dayjs';

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
  console.log(JSON.stringify(signedEvent));
  return btoa(JSON.stringify(signedEvent));
}

export async function fetchNip96List(
  server: Server,
  signEventTemplate: (template: EventTemplate) => Promise<SignedEvent>
) {
  const page = 0;
  const count = 100;
  const baseUrl = server.nip96?.api_url || server.url;
  const listUrl = `${baseUrl}?page=${page}&count=${count}`;

  const response = await fetch(listUrl, {
    headers: { Authorization: `Nostr ${await createNip98UploadAuthToken(listUrl, 'GET', signEventTemplate)}` },
  });

  const list = (await response.json()) as Nip96ListResponse;

  const getValueByTag = (tags: string[][], t: string) => tags.find(v => v[0] == t)?.[1];

  return list.files.map(
    file =>
      ({
        created: file.created_at,
        uploaded: file.created_at,
        type: getValueByTag(file.tags, 'm'),
        sha256: getValueByTag(file.tags, 'x'),
        size: parseInt(getValueByTag(file.tags, 'size') || '0', 10),
        url: getValueByTag(file.tags, 'url') || baseUrl + '/' + getValueByTag(file.tags, 'ox'),
      }) as BlobDescriptor
  );
}
