import { execFileSync } from 'node:child_process';
import { finalizeEvent } from 'nostr-tools/pure';
import type { EventTemplate } from 'nostr-tools';
import {
  BLOSSOM_REF_URL,
  BLOSSOM_URL,
  PUBKEY,
  RELAY_HTTP_URL,
  RELAY_URL,
  SECRET_KEY,
  publishToRelay,
} from './fixtures';

const compose = (...args: string[]) =>
  execFileSync('docker', ['compose', '-f', 'compose.yaml', ...args], {
    cwd: __dirname,
    stdio: 'inherit',
  });

async function waitForHttp(url: string, label: string, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await fetch(url);
      return;
    } catch (error) {
      if (Date.now() > deadline) throw new Error(`${label} did not come up at ${url}: ${String(error)}`);
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
}

const sign = (template: EventTemplate) => finalizeEvent(template, SECRET_KEY);

export default async function globalSetup() {
  compose('up', '-d');
  await Promise.all([
    waitForHttp(RELAY_HTTP_URL, 'nostr relay'),
    waitForHttp(BLOSSOM_URL, 'almond'),
    waitForHttp(BLOSSOM_REF_URL, 'blossom-server'),
  ]);

  const created_at = Math.floor(Date.now() / 1000);
  await publishToRelay([
    sign({ kind: 0, created_at, content: JSON.stringify({ name: 'bouquet-e2e' }), tags: [] }),
    // NIP-65: the browse page only syncs authored events from the user's own relays.
    sign({ kind: 10002, created_at, content: '', tags: [['r', RELAY_URL]] }),
    // The media servers the app should know about (kind 10063, BUD-03). Order
    // matters: the app pre-selects the first two servers for an upload.
    sign({
      kind: 10063,
      created_at,
      content: '',
      tags: [
        ['server', BLOSSOM_URL],
        ['server', BLOSSOM_REF_URL],
      ],
    }),
  ]);

  console.log(`[e2e] relay + 2 blossom servers ready, seeded for ${PUBKEY}`);

  return () => {
    compose('down', '-v', '-t', '2');
  };
}
