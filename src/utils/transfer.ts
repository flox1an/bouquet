import { AxiosProgressEvent } from 'axios';
import { BlobDescriptor, EventTemplate, SignedEvent } from 'blossom-client-sdk';
import { downloadBlossomBlob, mirrordBlossomBlob, uploadBlossomBlob } from './blossom';

async function blobUrlToFile(blobUrl: string, fileName: string): Promise<File> {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  const fileOptions = { type: blob.type, lastModified: Date.now() };
  return new File([blob], fileName, fileOptions);
}

// TODO support nip96
export const transferBlob = async (
  sourceUrl: string,
  targetServer: string,
  signEventTemplate: (template: EventTemplate) => Promise<SignedEvent>,
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void
): Promise<BlobDescriptor> => {
  console.log({ sourceUrl, targetServer });

  if (sourceUrl.startsWith('blob:')) {
    const file = await blobUrlToFile(sourceUrl, 'cover.jpg');
    return await uploadBlossomBlob(targetServer, file, signEventTemplate, onUploadProgress);
  } else {
    const blob = await mirrordBlossomBlob(targetServer, sourceUrl, signEventTemplate);
    if (blob) return blob;
    console.log('Mirror failed. Using download + upload instead.');

    const result = await downloadBlossomBlob(sourceUrl, onUploadProgress);

    const fileName = sourceUrl.replace(/.*\//, '');

    const file = new File([result.data], fileName, { type: result.type, lastModified: new Date().getTime() });

    return await uploadBlossomBlob(targetServer, file, signEventTemplate, onUploadProgress);
  }
};
