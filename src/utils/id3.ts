import * as id3 from 'id3js';
import { BlobDescriptor } from 'blossom-client-sdk';
import { ID3TagV2 } from 'id3js/lib/id3Tag';

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
function resizeImage(imageArray: ArrayBuffer, maxWidth: number, maxHeight: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([imageArray], { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);

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

      URL.revokeObjectURL(url); // Clean up
    };

    img.onerror = () => {
      reject(new Error('Image could not be loaded'));
      URL.revokeObjectURL(url); // Clean up
    };

    img.src = url;
  });
}

export const fetchId3Tag = async (blob: BlobDescriptor): Promise<AudioBlob> => {
  const db = await openIndexedDB();
  const cachedID3Tag = await getID3TagFromDB(db, blob.sha256);

  if (cachedID3Tag) {
    return { ...blob, id3: cachedID3Tag } as AudioBlob;
  }

  const id3Tag = await id3.fromUrl(blob.url).catch(e => console.warn(e));
  if (id3Tag) {
    const tagResult: ID3Tag = {
      title: id3Tag.title || undefined,
      artist: id3Tag.artist || undefined,
      album: id3Tag.album || undefined,
      year: id3Tag.year || undefined,
    };

    if (id3Tag.kind == 'v2') {
      const id3v2 = id3Tag as ID3TagV2;
      if (id3v2.images[0].data) {
        tagResult.cover = await resizeImage(id3v2.images[0].data, 128, 128);
      }
    }

    console.log(blob.sha256, tagResult);

    await saveID3TagToDB(db, blob.sha256, tagResult);
    return { ...blob, id3: tagResult };
  }
  console.log('No ID3 tag found for ' + blob.sha256);

  return blob; // only when ID3 fails completely
};
