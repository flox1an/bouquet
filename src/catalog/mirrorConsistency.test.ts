import { describe, expect, it } from 'vitest';
import type { BlobDescriptor } from 'blossom-client-sdk';
import { Catalog, MemoryCatalogStore, normalizeServerUrl } from './catalog';
import {
  buildReplicaOps,
  getAssetReplicaMap,
  projectCatalogAssets,
  queryCatalogTimeline,
  refreshReplicaAvailability,
} from './advanced';

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

function replicaCount(timeline: Awaited<ReturnType<typeof queryCatalogTimeline>>, sha256: string): number {
  const asset = timeline.find(item => item.primaryBlobSha256 === sha256);
  if (!asset) throw new Error(`No projected asset for ${sha256}`);
  return asset.replicaCount;
}

describe('mirror catalog consistency', () => {
  it('counts a completed mirror only after refreshed replica availability and reprojection', async () => {
    const catalog = await catalogWithServers([blob(hashA)]);
    const probe = async (server: { id: string; baseUrl: string }, sha256: string) => ({
      status: server.id === serverAId && sha256 === hashA ? 200 : 404,
      size: 42,
      mimeType: 'image/jpeg',
    });

    await refreshReplicaAvailability(catalog, pubkey, probe);
    await projectCatalogAssets(catalog, pubkey, { force: true });
    const beforeMirror = await queryCatalogTimeline(catalog, pubkey);
    expect(replicaCount(beforeMirror, hashA)).toBe(1);
    const assetId = beforeMirror.find(item => item.primaryBlobSha256 === hashA)?.assetId;
    if (!assetId) throw new Error('Missing asset ID for mirror target');

    expect(buildReplicaOps(await getAssetReplicaMap(catalog, pubkey, assetId), serverBId)).toHaveLength(1);

    // Upload evidence alone deliberately does not create a present blob_location row.
    await catalog.ingestUpload(pubkey, serverB, blob(hashA), true);
    await projectCatalogAssets(catalog, pubkey, { force: true });
    expect(replicaCount(await queryCatalogTimeline(catalog, pubkey), hashA)).toBe(1);

    await refreshReplicaAvailability(
      catalog,
      pubkey,
      async (server, sha256) => ({
        status: sha256 === hashA && (server.id === serverAId || server.id === serverBId) ? 200 : 404,
        size: 42,
        mimeType: 'image/jpeg',
      }),
      100,
      [hashA]
    );
    await projectCatalogAssets(catalog, pubkey, { force: true });

    const afterMirror = await queryCatalogTimeline(catalog, pubkey);
    expect(replicaCount(afterMirror, hashA)).toBe(2);
    expect(buildReplicaOps(await getAssetReplicaMap(catalog, pubkey, assetId), serverBId)).toHaveLength(0);
  });

  it('projects only successfully transferred blobs as destination replicas', async () => {
    const catalog = await catalogWithServers([blob(hashA), blob(hashB)]);
    await refreshReplicaAvailability(catalog, pubkey, async (server, sha256) => ({
      status: server.id === serverAId && (sha256 === hashA || sha256 === hashB) ? 200 : 404,
      size: 42,
      mimeType: 'image/jpeg',
    }));
    await projectCatalogAssets(catalog, pubkey, { force: true });
    expect(replicaCount(await queryCatalogTimeline(catalog, pubkey), hashA)).toBe(1);
    expect(replicaCount(await queryCatalogTimeline(catalog, pubkey), hashB)).toBe(1);

    // Only hashA's transfer completed; hashB's failed transfer creates no upload evidence.
    await catalog.ingestUpload(pubkey, serverB, blob(hashA), true);
    await refreshReplicaAvailability(
      catalog,
      pubkey,
      async (server, sha256) => ({
        status: server.id === serverAId || (server.id === serverBId && sha256 === hashA) ? 200 : 404,
        size: 42,
        mimeType: 'image/jpeg',
      }),
      100,
      [hashA]
    );
    await projectCatalogAssets(catalog, pubkey, { force: true });

    const timeline = await queryCatalogTimeline(catalog, pubkey);
    expect(replicaCount(timeline, hashA)).toBe(2);
    expect(replicaCount(timeline, hashB)).toBe(1);
  });
});
