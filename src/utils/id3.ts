import { BlobDescriptor } from 'blossom-client-sdk';
import { fromFile } from '@catamphetamine/id3js/browser';

type ID3TagV2 = {
  kind: 'v2';
  images: ImageValue[];
};

export interface ImageValue {
  type: null | string;
  mime: null | string;
  description: null | string;
  data: null | ArrayBuffer;
}

export type AudioBlob = BlobDescriptor & { id3?: ID3Tag };

export interface ID3Tag {
  artist?: string;
  album?: string;
  title?: string;
  year?: string;
  cover?: string;
}

// Function to open IndexedDB
function openIndexedDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('bouquet', 1);

    request.onupgradeneeded = event => {
      const db = (event.target as IDBOpenDBRequest).result;
      db.createObjectStore('id3');
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Function to get ID3Tag from IndexedDB
function getID3TagFromDB(db: IDBDatabase, hash: string): Promise<ID3Tag | null> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('id3', 'readonly');
    const store = transaction.objectStore('id3');
    const request = store.get(hash);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Function to save ID3Tag to IndexedDB
function saveID3TagToDB(db: IDBDatabase, key: string, id3Tag: ID3Tag): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('id3', 'readwrite');
    const store = transaction.objectStore('id3');
    const request = store.put(id3Tag, key);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// Function to resize image
function resizeImage(imageBlobUrl: string, maxWidth: number, maxHeight: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Calculate the aspect ratio
      const aspectRatio = width / height;

      // Adjust the width and height to maintain the aspect ratio within the max dimensions
      if (width > height) {
        if (width > maxWidth) {
          width = maxWidth;
          height = Math.round(width / aspectRatio);
        }
      } else {
        if (height > maxHeight) {
          height = maxHeight;
          width = Math.round(height * aspectRatio);
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        // Draw the image onto the canvas with the new dimensions
        ctx.drawImage(img, 0, 0, width, height);
        // Convert the canvas to a data URL
        const dataUrl = canvas.toDataURL('image/jpeg');
        resolve(dataUrl);
      } else {
        reject(new Error('Canvas context could not be retrieved'));
      }

      // URL.revokeObjectURL(url); // Clean up
    };

    img.onerror = () => {
      reject(new Error('Image could not be loaded'));
      // URL.revokeObjectURL(url); // Clean up
    };

    img.src = imageBlobUrl;
  });
}

export const fetchId3Tag = async (
  blobHash: string,
  blobUrl?: string,
  localFile?: File
): Promise<{ id3: ID3Tag; coverFull?: string } | undefined> => {
  const db = await openIndexedDB();
  const cachedID3Tag = await getID3TagFromDB(db, blobHash);

  // Don't cache the ID3 tag if we have a local file
  if (!localFile && cachedID3Tag) {
    return { id3: cachedID3Tag };
  }

  function arrayBufferToFile(arrayBuffer: ArrayBuffer, fileName: string, mimeType: string) {
    const fileBlob = new Blob([arrayBuffer], { type: mimeType });
    const file = new File([fileBlob], fileName, { type: mimeType });
    return file;
  }

  // Getting from URL would be the best but it requires working Range requests
  // an the servers. Currently non of the blossom servers are working.
  // HEAD -> content-length would also be required and is missing in some
  // instances. Consequently we need to download the whole file first :-(((
  // const id3Tag = await id3.fromUrl(blob.url).catch(e => console.warn(e));

  // download the whole song, convert to blob and file to read mp3 tag
  let file = localFile;
  if (!file) {
    if (!blobUrl) return undefined;

    // if we don't have a local file, download from blob url
    const response = await fetch(blobUrl);
    const buffer = await response.arrayBuffer();
    file = arrayBufferToFile(buffer, `${blobHash}.mp3`, 'audio/mpeg');
  }

  const id3Tag = await fromFile(file).catch(e => console.warn(e));
  let imageBlobUrl: string | undefined;

  if (id3Tag) {
    const tagResult: ID3Tag = {
      title: id3Tag.title || undefined,
      artist: id3Tag.artist || undefined,
      album: id3Tag.album || undefined,
      year: id3Tag.year || undefined,
    };

    if (id3Tag.kind == 'v2') {
      const id3v2 = id3Tag as unknown as ID3TagV2;
      if (id3v2.images && id3v2.images.length > 0 && id3v2.images[0].data) {
        const blob = new Blob([id3v2.images[0].data], { type: 'image/jpeg' });
        imageBlobUrl = URL.createObjectURL(blob);
        tagResult.cover = await resizeImage(imageBlobUrl, 128, 128);
      }
    }

    console.log(blobHash, blobUrl, tagResult);

    await saveID3TagToDB(db, blobHash, tagResult);
    return { id3: tagResult, coverFull: imageBlobUrl };
  }
  console.log('No ID3 tag found for ' + blobHash);
};
