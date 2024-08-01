import { AxiosProgressEvent } from 'axios';
import { BlobDescriptor, EventTemplate, SignedEvent } from 'blossom-client-sdk';
import { downloadBlossomBlob, mirrordBlossomBlob, uploadBlossomBlob } from './blossom';
import { Server } from './useUserServers';
import { uploadNip96File } from './nip96';

async function blobUrlToFile(blobUrl: string, fileName: string): Promise<File> {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  const fileOptions = { type: blob.type, lastModified: Date.now() };
  return new File([blob], fileName, fileOptions);
}

// TODO support nip96
export const transferBlob = async (
  sourceUrl: string,
  targetServer: Server,
  signEventTemplate: (template: EventTemplate) => Promise<SignedEvent>,
  onProgress?: (progressEvent: AxiosProgressEvent) => void
): Promise<BlobDescriptor> => {
  console.log({ sourceUrl, targetServer });

  if (sourceUrl.startsWith('blob:')) {
    const file = await blobUrlToFile(sourceUrl, 'cover.jpg');
    if (targetServer.type == 'blossom') {
      return await uploadBlossomBlob(targetServer.url, file, signEventTemplate, onProgress);
    } else {
      return await uploadNip96File(targetServer, file, 'cover.jpg', signEventTemplate, onProgress);
    }
  } else {
    if (targetServer.type == 'blossom') {
      const blob = await mirrordBlossomBlob(targetServer.url, sourceUrl, signEventTemplate);
      onProgress &&
        onProgress({
          loaded: blob.size,
          bytes: blob.size,
          lengthComputable: true,
        });
      if (blob) return blob;
      console.log('Mirror failed. Using download + upload instead.');
    }

    const result = await downloadBlossomBlob(sourceUrl, onProgress);

    const fileName = sourceUrl.replace(/.*\//, '');

    const file = new File([result.data], fileName, { type: result.type, lastModified: new Date().getTime() });

    if (targetServer.type == 'blossom') {
      return await uploadBlossomBlob(targetServer.url, file, signEventTemplate, onProgress);
    } else {
      return await uploadNip96File(targetServer, file, fileName, signEventTemplate, onProgress); // TODO add caption
    }
  }
};
