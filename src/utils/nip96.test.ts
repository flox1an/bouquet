import { describe, expect, it, vi, afterEach } from 'vitest';
import axios from 'axios';
import type { EventTemplate } from 'blossom-client-sdk';
import { fetchNip96List, uploadNip96File, deleteNip96File } from './nip96';
import type { Server } from './useUserServers';

const sign = async (t: EventTemplate) => ({ ...t, id: '1', sig: 's' }) as never;

const nip96Config = (apiUrl: string) => ({
  status: 200,
  headers: { 'content-type': 'application/json' },
  json: () => Promise.resolve({ api_url: apiUrl, download_url: apiUrl, supported_nips: [96], tos_url: '' }),
});

const nip96UploadResult = (sha256: string) => ({
  status: 'success',
  nip94_event: { tags: [['x', sha256], ['m', 'text/plain'], ['size', '5']] },
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('NIP-96 api_url resolution', () => {
  it('resolves api_url from the well-known config before listing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => nip96Config('https://cdn.example')));
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { count: 0, total: 0, files: [] } });
    const server: Server = { type: 'nip96', name: 'nostrcheck', url: 'https://nostrcheck.example' };

    await fetchNip96List(server, sign);

    expect(get.mock.calls[0][0]).toBe('https://cdn.example?page=0&count=100');
  });

  it('uses an already-loaded api_url without re-fetching the config', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { count: 0, total: 0, files: [] } });
    const server: Server = {
      type: 'nip96',
      name: 'nostrcheck',
      url: 'https://nostrcheck.example',
      nip96: {
        api_url: 'https://cdn.example',
        download_url: 'https://cdn.example',
        supported_nips: [96],
        tos_url: '',
        content_types: [],
        plans: {},
      },
    };

    await fetchNip96List(server, sign);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(get.mock.calls[0][0]).toBe('https://cdn.example?page=0&count=100');
  });

  it('falls back to server.url when the config is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ data: { count: 0, total: 0, files: [] } });
    const server: Server = { type: 'nip96', name: 'nostrcheck', url: 'https://nostrcheck.example' };

    await fetchNip96List(server, sign);

    expect(get.mock.calls[0][0]).toBe('https://nostrcheck.example?page=0&count=100');
  });

  it('uploads and deletes against the resolved api_url, not server.url', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => nip96Config('https://cdn.example')));
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: nip96UploadResult('a'.repeat(64)) });
    const del = vi.spyOn(axios, 'delete').mockResolvedValue({ data: { status: 'success' } });
    const server: Server = { type: 'nip96', name: 'nostrcheck', url: 'https://nostrcheck.example' };
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });

    await uploadNip96File(server, file, 'caption', sign);
    expect(post.mock.calls[0][0]).toBe('https://cdn.example');

    await deleteNip96File(server, 'a'.repeat(64), sign);
    expect(del.mock.calls[0][0]).toBe(`https://cdn.example/${'a'.repeat(64)}`);
  });
});
