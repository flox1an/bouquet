import type { NativeUrlProbe, ReplicaProbe } from './advanced';

export const probeReplica: ReplicaProbe = async (server, sha256) => {
  const response = await fetch(`${server.baseUrl}/${sha256}`, { method: 'HEAD' });
  return {
    status: response.status,
    size: Number(response.headers.get('content-length')) || undefined,
    mimeType: response.headers.get('content-type')?.split(';')[0],
    url: response.url,
  };
};

export const probeNativeUrl: NativeUrlProbe = async url => {
  const response = await fetch(url, { method: 'HEAD' });
  return {
    status: response.status,
    size: Number(response.headers.get('content-length')) || undefined,
    mimeType: response.headers.get('content-type')?.split(';')[0],
    url: response.url,
  };
};
