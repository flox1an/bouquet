import { sha256 } from '@noble/hashes/sha256';
import dayjs from 'dayjs';

export const formatFileSize = (size: number) => {
  if (size < 1024) {
    return size + ' B';
  } else if (size < 1024 * 1024) {
    return (size / 1024).toFixed(1) + ' KB';
  } else if (size < 1024 * 1024 * 1024) {
    return (size / 1024 / 1024).toFixed(1) + ' MB';
  } else {
    return (size / 1024 / 1024 / 1024).toFixed(1) + ' GB';
  }
};

interface MyObject {
  [key: string]: any;
}

export function hashSha256(obj: MyObject): string {
  const jsonString = JSON.stringify(obj);

  const hashBuffer = sha256(new TextEncoder().encode(jsonString));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

export const uniqAndSort = (values: string[]): string[] => {
  return Array.from(new Set(values)).sort();
};

export const pr = (value: string | number, len: number) => {
  return value.toString().padEnd(len);
};

export const pl = (value: string | number, len: number) => {
  return `${value}`.padStart(len);
};

export const formatDate = (unixTimeStamp: number): string => {
  const ts = unixTimeStamp > 1711200000000 ? unixTimeStamp / 1000 : unixTimeStamp;
  if (ts == 0) return 'never';
  return dayjs(ts * 1000).format('YYYY-MM-DD');
};

export function extractDomain(url: string): string | null {
  const regex = /^(https?:\/\/)([^/]+)/;
  const match = url.match(regex);
  return match ? match[2]?.toLocaleLowerCase() : null;
}
