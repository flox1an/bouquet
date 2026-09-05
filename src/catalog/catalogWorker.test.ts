/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { Catalog, MemoryCatalogStore } from './catalog';
import { CatalogClient } from './catalogClient';
import { createCatalogWorkerHost } from './catalogWorker';

type MessageHandler = (event: MessageEvent) => void;

class FakePort {
  peer?: FakePort;
  onmessage?: MessageHandler;
  private listeners = new Set<MessageHandler>();

  postMessage(message: unknown) {
    queueMicrotask(() => this.peer?.dispatch(message));
  }

  addEventListener(_type: 'message', listener: MessageHandler) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: MessageHandler) {
    this.listeners.delete(listener);
  }

  private dispatch(data: unknown) {
    const event = { data } as MessageEvent;
    this.onmessage?.(event);
    for (const listener of this.listeners) listener(event);
  }
}

const pairedPorts = () => {
  const client = new FakePort();
  const worker = new FakePort();
  client.peer = worker;
  worker.peer = client;
  return { client, worker };
};
describe('catalog worker bridge', () => {
  it('round-trips bridged loaders, worker errors, and catalog change notifications', async () => {
    const { client: clientPort, worker: workerPort } = pairedPorts();
    createCatalogWorkerHost(workerPort, new Catalog(new MemoryCatalogStore()));
    const client = new CatalogClient(clientPort);
    const changes: string[] = [];
    window.addEventListener('bouquet-catalog-changed', () => changes.push('changed'));

    await client.syncAuthoredEvents('p'.repeat(64), 'wss://relay.example', async () => []);
    await expect(
      client.syncAuthoredEvents('p'.repeat(64), 'wss://relay.example', async () => {
        throw new Error('bridge failed');
      })
    ).rejects.toThrow('bridge failed');

    expect(changes).not.toHaveLength(0);
  });
});
