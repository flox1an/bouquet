import { createHash, randomUUID } from 'node:crypto';
import type { APIRequestContext, Page } from '@playwright/test';
import { hexToBytes } from '@noble/hashes/utils.js';
import { getPublicKey, nip19 } from 'nostr-tools';
import type { Filter, NostrEvent, VerifiedEvent } from 'nostr-tools';
import { finalizeEvent } from 'nostr-tools/pure';

export const RELAY_URL = 'ws://localhost:7777';
export const RELAY_HTTP_URL = 'http://localhost:7777';
/** almond, and the Blossom reference implementation. */
export const BLOSSOM_URL = 'http://localhost:3300';
export const BLOSSOM_REF_URL = 'http://localhost:3301';
export const APP_URL = 'http://localhost:5273';

/** Fixed test identity - the stack is wiped between runs, so a literal key is fine.
    Its npub is whitelisted as almond's operator in compose.yaml. */
export const SECRET_KEY = hexToBytes('9b1a6cbbfc7c2f5d6a3e8f4c1d0b7a95e3c48d21f6b0a7c9d4e2f13a8b5c6079');
export const PUBKEY = getPublicKey(SECRET_KEY);
export const NSEC = nip19.nsecEncode(SECRET_KEY);

/** BUD-11 authorization header, so a test can query the media server directly. */
export function blossomAuth(verb: 'list' | 'get') {
  const created_at = Math.floor(Date.now() / 1000);
  const event = finalizeEvent(
    {
      kind: 24242,
      created_at,
      content: `Authorize ${verb}`,
      tags: [
        ['t', verb],
        ['expiration', String(created_at + 300)],
      ],
    },
    SECRET_KEY
  );
  // BUD-11 mandates the JWT-style base64url alphabet, unpadded.
  return { Authorization: `Nostr ${Buffer.from(JSON.stringify(event)).toString('base64url')}` };
}

async function openRelay() {
  const socket = new WebSocket(RELAY_URL);
  const opened = Promise.withResolvers<void>();
  socket.addEventListener('open', () => opened.resolve(), { once: true });
  socket.addEventListener('error', () => opened.reject(new Error(`Cannot reach relay at ${RELAY_URL}`)), {
    once: true,
  });
  await opened.promise;
  return socket;
}

/** Publishes and waits for an OK per event, so nothing races the seed data. */
export async function publishToRelay(events: VerifiedEvent[]) {
  const socket = await openRelay();
  const stored = Promise.withResolvers<void>();
  const accepted = new Set<string>();

  socket.addEventListener('message', message => {
    const [type, id, ok, reason] = JSON.parse(String(message.data));
    if (type !== 'OK') return;
    if (!ok) return stored.reject(new Error(`Relay rejected event ${id}: ${reason}`));
    accepted.add(id);
    if (accepted.size === events.length) stored.resolve();
  });

  for (const event of events) socket.send(JSON.stringify(['EVENT', event]));
  await stored.promise;
  socket.close();
}

/** Everything the relay holds for one filter, read straight off the wire - the
    only way to check that the app's publish actually landed. */
export async function queryRelay(filter: Filter): Promise<NostrEvent[]> {
  const socket = await openRelay();
  const complete = Promise.withResolvers<NostrEvent[]>();
  const events: NostrEvent[] = [];

  socket.addEventListener('message', message => {
    const [type, , payload] = JSON.parse(String(message.data));
    if (type === 'EVENT') events.push(payload as NostrEvent);
    if (type === 'EOSE') complete.resolve(events);
  });

  socket.send(JSON.stringify(['REQ', 'e2e', filter]));
  const result = await complete.promise;
  socket.close();
  return result;
}

/** A blob descriptor as BUD-02 lists it; only the fields the tests read. */
export type ListedBlob = { sha256: string; size: number; type: string };

/** A file to hand to `setInputFiles`, plus the hash the servers must end up with. */
export type UploadFixture = {
  file: { name: string; mimeType: string; buffer: Buffer };
  sha256: string;
};

/** A unique, non-image payload per call - tiny unless `sizeBytes` asks for more.
    Unique so no upload ever dedupes against an earlier test's blob, non-image so
    the app's EXIF/resize path cannot rewrite the bytes - the hash below is then
    exactly what the servers must store. */
export function uniqueUpload(label: string, sizeBytes?: number): UploadFixture {
  const head = Buffer.from(`bouquet e2e ${label} ${randomUUID()}\n`);
  const buffer =
    sizeBytes && sizeBytes > head.length
      ? Buffer.concat([head, Buffer.alloc(sizeBytes - head.length, 0x2e)])
      : head;
  return {
    file: { name: `${label}.txt`, mimeType: 'text/plain', buffer },
    sha256: createHash('sha256').update(buffer).digest('hex'),
  };
}

/** Logs in via nsec and waits until the seeded server list has rendered. An nsec
    login is never persisted, so every test has to do this itself. */
export async function login(page: Page) {
  await page.getByRole('button', { name: 'Nsec' }).click();
  await page.getByPlaceholder('nsec1').fill(NSEC);
  await page.getByRole('button', { name: 'Login with Nsec' }).click();
}

/** BUD-02 listing straight off a server - the only proof the bytes really landed. */
export async function listBlobs(request: APIRequestContext, serverUrl: string): Promise<ListedBlob[]> {
  const response = await request.get(`${serverUrl}/list/${PUBKEY}`, { headers: blossomAuth('list') });
  if (!response.ok()) throw new Error(`GET ${serverUrl}/list failed: ${response.status()}`);
  return (await response.json()) as ListedBlob[];
}
