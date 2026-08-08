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

let id3Database: Promise<IDBDatabase> | undefined;

function openIndexedDB(): Promise<IDBDatabase> {
  if (id3Database) return id3Database;
  id3Database = new Promise((resolve, reject) => {
    const request = indexedDB.open('bouquet', 1);

    request.onupgradeneeded = event => {
      const db = (event.target as IDBOpenDBRequest).result;
      db.createObjectStore('id3');
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      id3Database = undefined;
      reject(request.error);
    };
  });
  return id3Database;
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

export const getCachedId3Tag = async (blobHash: string): Promise<ID3Tag | undefined> => {
  try {
    const db = await openIndexedDB();
    return (await getID3TagFromDB(db, blobHash)) ?? undefined;
  } catch {
    return undefined;
  }
};

const ID3_HEADER_BYTES = 10;
const MAX_ID3_TAG_BYTES = 8 * 1024 * 1024;

function arrayBufferToFile(arrayBuffer: ArrayBuffer, fileName: string, mimeType: string) {
  return new File([new Blob([arrayBuffer], { type: mimeType })], fileName, { type: mimeType });
}

function id3v2TagLength(bytes: Uint8Array): number | undefined {
  if (bytes.length < ID3_HEADER_BYTES || String.fromCharCode(...bytes.slice(0, 3)) !== 'ID3') return;
  const payloadLength = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9];
  const tagLength = ID3_HEADER_BYTES + payloadLength;
  return tagLength > ID3_HEADER_BYTES && tagLength <= MAX_ID3_TAG_BYTES ? tagLength : undefined;
}

async function fullAudioFile(blobUrl: string, blobHash: string): Promise<File> {
  const response = await fetch(blobUrl);
  if (!response.ok) throw new Error(`Audio download failed with ${response.status}`);
  return arrayBufferToFile(await response.arrayBuffer(), `${blobHash}.mp3`, 'audio/mpeg');
}

async function audioTagFile(blobUrl: string, blobHash: string): Promise<File> {
  try {
    const headerResponse = await fetch(blobUrl, { headers: { Range: 'bytes=0-9' } });
    if (!headerResponse.ok) throw new Error(`Range request failed with ${headerResponse.status}`);
    const headerBytes = new Uint8Array(await headerResponse.arrayBuffer());
    if (headerResponse.status !== 206) return arrayBufferToFile(headerBytes.buffer, `${blobHash}.mp3`, 'audio/mpeg');

    const tagLength = id3v2TagLength(headerBytes);
    if (!tagLength) return fullAudioFile(blobUrl, blobHash);

    const tagResponse = await fetch(blobUrl, { headers: { Range: `bytes=0-${tagLength - 1}` } });
    if (!tagResponse.ok) throw new Error(`Tag range request failed with ${tagResponse.status}`);
    return arrayBufferToFile(await tagResponse.arrayBuffer(), `${blobHash}.mp3`, 'audio/mpeg');
  } catch {
    return fullAudioFile(blobUrl, blobHash);
  }
}

type QueuedId3Load = {
  blobHash: string;
  blobUrl: string;
  resolve: (result: { id3: ID3Tag; coverFull?: string } | undefined) => void;
  reject: (error: unknown) => void;
};

const ID3_QUEUE_CONCURRENCY = 3;
const queuedId3Loads = new Map<string, Promise<{ id3: ID3Tag; coverFull?: string } | undefined>>();
const pendingId3Loads: QueuedId3Load[] = [];
let activeId3Loads = 0;

function drainId3Queue() {
  while (activeId3Loads < ID3_QUEUE_CONCURRENCY && pendingId3Loads.length > 0) {
    const job = pendingId3Loads.shift()!;
    activeId3Loads += 1;
    void fetchId3Tag(job.blobHash, job.blobUrl)
      .then(job.resolve, job.reject)
      .finally(() => {
        activeId3Loads -= 1;
        drainId3Queue();
      });
  }
}

export function queueId3Tag(blobHash: string, blobUrl: string): Promise<{ id3: ID3Tag; coverFull?: string } | undefined> {
  const existing = queuedId3Loads.get(blobHash);
  if (existing) return existing;
  const pending = new Promise<{ id3: ID3Tag; coverFull?: string } | undefined>((resolve, reject) => {
    pendingId3Loads.push({ blobHash, blobUrl, resolve, reject });
  });
  queuedId3Loads.set(blobHash, pending);
  drainId3Queue();
  return pending;
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

  const file = localFile ?? (blobUrl ? await audioTagFile(blobUrl, blobHash) : undefined);
  if (!file) return undefined;

  let id3Tag = await fromFile(file).catch(() => undefined);
  if (!id3Tag && !localFile && blobUrl) id3Tag = await fromFile(await fullAudioFile(blobUrl, blobHash)).catch(() => undefined);
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

    

    await saveID3TagToDB(db, blobHash, tagResult);
    return { id3: tagResult, coverFull: imageBlobUrl };
  }
  
};
