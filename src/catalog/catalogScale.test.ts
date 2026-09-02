import { describe, expect, it } from 'vitest';
import { Catalog, MemoryCatalogStore, type CatalogStore, type StoreName } from './catalog';
import {
  getCatalogAssetContents,
  getCatalogTimelineAsset,
  projectCatalogAssets,
  queryCatalogAssetIds,
  queryCatalogTimeline,
} from './advanced';

/** Counts reads so a scale claim can be asserted exactly rather than timed. */
class CountingStore implements CatalogStore {
  readonly scans: StoreName[] = [];
  readonly reads: string[] = [];
  constructor(private readonly inner: CatalogStore) {}
  get<T>(store: StoreName, key: IDBValidKey) {
    this.reads.push(`get:${store}`);
    return this.inner.get<T>(store, key);
  }
  put<T>(store: StoreName, value: T) {
    return this.inner.put(store, value);
  }
  putMany<T>(store: StoreName, values: T[]) {
    return this.inner.putMany(store, values);
  }
  getAll<T>(store: StoreName) {
    this.scans.push(store);
    this.reads.push(`getAll:${store}`);
    return this.inner.getAll<T>(store);
  }
  getAllFromIndex<T>(store: StoreName, index: string, key: IDBValidKey) {
    this.reads.push(`index:${store}.${index}`);
    return this.inner.getAllFromIndex<T>(store, index, key);
  }
  delete(store: StoreName, key: IDBValidKey) {
    return this.inner.delete(store, key);
  }
  reset() {
    return this.inner.reset();
  }
}

const pubkey = 'p'.repeat(64);
const hashFor = (i: number) => i.toString(16).padStart(64, '0');

async function catalogOf(count: number) {
  const catalog = new Catalog(new MemoryCatalogStore());
  await catalog.ingestServerList(pubkey, {
    server: { url: 'https://a.example/', type: 'blossom' },
    blobs: Array.from({ length: count }, (_, i) => ({
      sha256: hashFor(i),
      url: `https://media.example/${hashFor(i)}`,
      type: i % 3 === 0 ? 'video/mp4' : 'image/jpeg',
      size: 1024 * (i % 500),
      uploaded: 1_700_000_000 + i,
    })),
    state: 'complete',
  });
  return catalog;
}

describe('catalog scale', () => {
  // Bounds are deliberately loose: they exist to catch a change from linear to
  // quadratic, not to police milliseconds on a particular machine. Measured at
  // roughly 10us per asset, so 5000 assets is ~50ms against a 5s budget.
  it('projects and queries a five thousand asset catalog in linear time', async () => {
    const catalog = await catalogOf(5000);

    const startProject = Date.now();
    await projectCatalogAssets(catalog, pubkey, { force: true });
    const projectMs = Date.now() - startProject;

    const startQuery = Date.now();
    const timeline = await queryCatalogTimeline(catalog, pubkey);
    const queryMs = Date.now() - startQuery;

    expect(timeline).toHaveLength(5000);
    expect(projectMs).toBeLessThan(5000);
    expect(queryMs).toBeLessThan(5000);
  });

  it('keeps search proportional to the catalog, not to the matches', async () => {
    const catalog = await catalogOf(5000);
    await projectCatalogAssets(catalog, pubkey, { force: true });
    const start = Date.now();
    const found = await queryCatalogTimeline(catalog, pubkey, { search: 'video' });
    expect(Date.now() - start).toBeLessThan(5000);
    expect(found.length).toBeGreaterThan(0);
  });

  // Filtering ran 4-5s in the browser because every query read `timeline_projection`,
  // `asset_blob` and `blob_location` whole. Only the two selective filters may join.
  it('answers ordinary filters from the projection table alone', async () => {
    const catalog = await catalogOf(500);
    await projectCatalogAssets(catalog, pubkey, { force: true });
    const counting = new CountingStore(catalog.store);
    const scoped = new Catalog(counting);

    await queryCatalogTimeline(scoped, pubkey, { types: ['video'], search: 'video', availability: ['unknown'] });
    expect(counting.scans).toEqual(['timeline_projection']);

    counting.scans.length = 0;
    await queryCatalogTimeline(scoped, pubkey, { serverId: 'https://one.example' });
    expect(counting.scans).toEqual(['timeline_projection', 'asset_blob']);

    // Browse's server and hash filters need ids only, so they must not touch
    // projections at all - that read is what a filter change used to wait for.
    counting.scans.length = 0;
    // This fixture never probed a server, so the answer is empty; `catalog.test.ts`
    // covers which assets a populated server filter returns.
    await queryCatalogAssetIds(scoped, { serverId: 'https://one.example' });
    expect(counting.scans).toEqual(['asset_blob']);
    counting.scans.length = 0;
    // `hashFor` pads with zeros, so only the tail of the hash is selective.
    const byHash = await queryCatalogAssetIds(scoped, { hashTerms: [hashFor(3)] });
    expect(counting.scans).toEqual(['asset_blob']);
    expect(byHash).toEqual([`${pubkey}:root-blob:${hashFor(3)}`]);
  });

  it('hides projections left behind by an earlier run', async () => {
    const catalog = await catalogOf(10);
    await projectCatalogAssets(catalog, pubkey, { force: true });
    const [stale, ...rest] = await queryCatalogTimeline(catalog, pubkey);
    expect(rest.length).toBe(9);

    await catalog.store.put('timeline_projection', { ...stale, projectedAt: stale.projectedAt - 1 });
    expect((await queryCatalogTimeline(catalog, pubkey)).map(item => item.assetId)).not.toContain(stale.assetId);
  });

  // Browse renders one of these per visible row, so any full-table scan here turns
  // scrolling into work proportional to the whole catalog times the rows on screen.
  it("reads one item's contents without scanning any table, at any catalog size", async () => {
    const readsFor = async (count: number) => {
      const catalog = await catalogOf(count);
      await projectCatalogAssets(catalog, pubkey, { force: true });
      const [first] = await queryCatalogTimeline(catalog, pubkey);
      const counting = new CountingStore(catalog.store);
      const contents = await getCatalogAssetContents(new Catalog(counting), first.assetId, 4);
      expect(contents.totalCount).toBeGreaterThan(0);
      return counting;
    };

    const small = await readsFor(100);
    const large = await readsFor(5000);
    expect(small.scans).toEqual([]);
    expect(large.scans).toEqual([]);
    expect(large.reads).toEqual(small.reads);
  });

  it('loads a whole asset detail without scanning any table', async () => {
    const catalog = await catalogOf(500);
    await projectCatalogAssets(catalog, pubkey, { force: true });
    const [first] = await queryCatalogTimeline(catalog, pubkey);
    const counting = new CountingStore(catalog.store);
    const detail = await getCatalogTimelineAsset(new Catalog(counting), pubkey, first.assetId);
    expect(detail?.blobs.length).toBeGreaterThan(0);
    expect(counting.scans).toEqual([]);
  });
});
