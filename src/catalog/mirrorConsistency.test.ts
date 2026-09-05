import { describe, expect, it } from 'vitest';
import type { BlobDescriptor } from 'blossom-client-sdk';
import { Catalog, MemoryCatalogStore, normalizeServerUrl } from './catalog';
import type { TimelineProjection } from './advanced';

const pubkey = 'p'.repeat(64);
const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const serverA = { url: 'https://mirror-source.example/', type: 'blossom' as const };
const serverB = { url: 'https://mirror-destination.example/', type: 'blossom' as const };
const serverAId = normalizeServerUrl(serverA.url);
const serverBId = normalizeServerUrl(serverB.url);

function blob(sha256: string): BlobDescriptor {
  return { sha256, url: `https://media.example/${sha256}`, type: 'image/jpeg', size: 42, uploaded: 1 };
}

async function catalogWithServers(sourceBlobs: BlobDescriptor[]) {
  const catalog = new Catalog(new MemoryCatalogStore());
  await catalog.ingestServerList(pubkey, { server: serverA, blobs: sourceBlobs, state: 'complete' });
  await catalog.ingestServerList(pubkey, { server: serverB, blobs: [], state: 'complete' });
  return catalog;
}

function replicaCount(timeline: TimelineProjection[], sha256: string): number {
  const asset = timeline.find(item => item.primaryBlobSha256 === sha256);
  if (!asset) throw new Error(`No projected asset for ${sha256}`);
  return asset.replicaCount;
}

describe('mirror catalog consistency', () => {
  it('makes a completed mirror visible after catalog ingestion', async () => {
    const catalog = await catalogWithServers([blob(hashA)]);

    await catalog.ingestUpload(pubkey, serverB, blob(hashA), true);

    expect(replicaCount(await catalog.queryCatalogTimeline(pubkey), hashA)).toBe(2);
  });

  it('projects only successfully transferred blobs as destination replicas', async () => {
    const catalog = await catalogWithServers([blob(hashA), blob(hashB)]);
    await catalog.refreshReplicaAvailability(pubkey, async (server, sha256) => ({
      status: server.id === serverAId && (sha256 === hashA || sha256 === hashB) ? 200 : 404,
      size: 42,
      mimeType: 'image/jpeg',
    }));
    await catalog.queryCatalogTimeline(pubkey);
    expect(replicaCount(await catalog.queryCatalogTimeline(pubkey), hashA)).toBe(1);
    expect(replicaCount(await catalog.queryCatalogTimeline(pubkey), hashB)).toBe(1);

    // Only hashA's transfer completed; hashB's failed transfer creates no upload evidence.
    await catalog.ingestUpload(pubkey, serverB, blob(hashA), true);
    await catalog.refreshReplicaAvailability(pubkey,
    async (server, sha256) => ({
      status: server.id === serverAId || (server.id === serverBId && sha256 === hashA) ? 200 : 404,
      size: 42,
      mimeType: 'image/jpeg',
    }),
    100,
    [hashA]);
    await catalog.queryCatalogTimeline(pubkey);

    const timeline = await catalog.queryCatalogTimeline(pubkey);
    expect(replicaCount(timeline, hashA)).toBe(2);
    expect(replicaCount(timeline, hashB)).toBe(1);
  });
});
