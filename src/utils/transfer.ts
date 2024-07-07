import axios, { AxiosProgressEvent } from 'axios';
import { BlobDescriptor, BlossomClient, EventTemplate, SignedEvent } from 'blossom-client-sdk';

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

export const transferBlob = async (
  sourceUrl: string,
  targetServer: string,
  signEventTemplate: (template: EventTemplate) => Promise<SignedEvent>,
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void
): Promise<BlobDescriptor> => {
  console.log({ sourceUrl, targetServer });
  const result = await downloadBlob(sourceUrl, onUploadProgress);

  const fileName = sourceUrl.replace(/.*\//, '');

  const file = new File([result.data], fileName, { type: result.type, lastModified: new Date().getTime() });

  return await uploadBlob(targetServer, file, signEventTemplate, onUploadProgress);
};
