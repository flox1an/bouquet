import { describe, expect, it } from 'vitest';
import { Catalog, MemoryCatalogStore } from './catalog';
import { projectCatalogAssets, queryCatalogTimeline } from './advanced';

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
});
