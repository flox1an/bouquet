import axios, { AxiosProgressEvent } from 'axios';
import { BlobDescriptor, BlossomClient, EventTemplate, SignedEvent } from 'blossom-client-sdk';
import { extractHashFromUrl } from './blossom';

export const uploadBlob = async (
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

export const downloadBlob = async (url: string, onDownloadProgress?: (progressEvent: AxiosProgressEvent) => void) => {
  const response = await axios.get(url, {
    responseType: 'blob',
    onDownloadProgress,
  });

  return { data: response.data, type: response.headers['Content-Type']?.toString() };
};

export const mirrordBlob = async (
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

async function blobUrlToFile(blobUrl: string, fileName: string): Promise<File> {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  const fileOptions = { type: blob.type, lastModified: Date.now() };
  return new File([blob], fileName, fileOptions);
}

export const transferBlob = async (
  sourceUrl: string,
  targetServer: string,
  signEventTemplate: (template: EventTemplate) => Promise<SignedEvent>,
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void
): Promise<BlobDescriptor> => {
  console.log({ sourceUrl, targetServer });

  if (sourceUrl.startsWith('blob:')) {
    const file = await blobUrlToFile(sourceUrl, 'cover.jpg');
    return await uploadBlob(targetServer, file, signEventTemplate, onUploadProgress);
  } else {
    const blob = await mirrordBlob(targetServer, sourceUrl, signEventTemplate);
    if (blob) return blob;
    console.log('Mirror failed. Using download + upload instead.');

    const result = await downloadBlob(sourceUrl, onUploadProgress);

    const fileName = sourceUrl.replace(/.*\//, '');

    const file = new File([result.data], fileName, { type: result.type, lastModified: new Date().getTime() });

    return await uploadBlob(targetServer, file, signEventTemplate, onUploadProgress);
  }
};
