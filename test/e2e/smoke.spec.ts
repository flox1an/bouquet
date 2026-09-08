import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { NostrEvent } from 'nostr-tools';
import {
  BLOSSOM_REF_URL,
  BLOSSOM_URL,
  PUBKEY,
  SECRET_KEY,
  listBlobs,
  login,
  publishToRelay,
  queryRelay,
  seedBlob,
  uniqueUpload,
  waitForCatalogReplicas,
  type UploadFixture,
} from './fixtures';
import { finalizeEvent } from 'nostr-tools/pure';
/** Runs the wizard from file selection up to the publish step, which is where the
    bytes are on the servers and no event has been published yet. */
async function uploadFiles(page: Page, files: UploadFixture['file'][]) {
  await page.setInputFiles('#browse', files);
  await page.getByRole('button', { name: new RegExp(`^Upload ${files.length} file`) }).click();
  await expect(page.getByRole('heading', { name: 'Publish Nostr events' })).toBeVisible();
}

async function publishEvents(page: Page, count: number) {
  await page.getByRole('button', { name: new RegExp(`^Publish \\(${count} event`) }).click();
  await expect(page.getByRole('heading', { name: 'Publishing results' })).toBeVisible();
}

/** The kind 1063 for one hash, read off the relay - the UI saying "published" is
    not proof that the event left the browser. */
async function fileEventFor(sha256: string) {
  let event: NostrEvent | undefined;
  await expect
    .poll(async () => {
      const events = await queryRelay({ kinds: [1063], authors: [PUBKEY] });
      event = events.find(candidate => candidate.tags.some(tag => tag[0] === 'x' && tag[1] === sha256));
      return Boolean(event);
    })
    .toBe(true);
  return event!;
}

/** Login plus the wait for the seeded server list. Explicit per test instead of a
    beforeEach because two tests have to touch the servers over HTTP *before* the
    app reads its listings - seeding after login would race the staleTime=Infinity
    list cache the sync page diffs against. */
async function startSession(page: Page) {
  await page.goto('/upload');
  await login(page);
  // The checkboxes only render once the seeded kind 10063 list arrives from the
  // ephemeral relay - proof the relay round trip works. Both are pre-selected.
  await expect(page.getByRole('checkbox', { name: /localhost:3300/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /localhost:3301/ })).toBeChecked();
  await settleListings(page);
}

/** Walks the sync page far enough to prove the login-time listing ingestion has
    settled: the summary only computes once BOTH server listings resolved, so
    either outcome ("no missing" or "N media files missing") is a deterministic
    barrier. Without it, a listing resolving late re-ingests as `full` and
    withdraws the locations a just-finished upload wrote - the delete planning
    then believes the blob is on no server. */
async function settleListings(page: Page) {
  // In-app navigation only: a page.goto reloads and an nsec login is never
  // persisted, so a reload would land back on the login screen.
  await page.getByRole('link', { name: 'Sync' }).click();
  await page.getByRole('button', { name: 'Choose a source server' }).click();
  await page.getByRole('menuitemradio', { name: /localhost:3300/ }).click();
  await page.getByRole('button', { name: 'Select target server' }).click();
  await page.getByRole('menuitemradio', { name: /localhost:3301/ }).click();
  await expect(page.getByText(/No missing files to transfer\.|media files? missing on localhost:3301/)).toBeVisible();
  await page.getByRole('link', { name: 'Upload' }).click();
}

test('uploads to a single selected server and publishes the file event', async ({ page, request }) => {
  await startSession(page);

  const { file, sha256 } = uniqueUpload('single');

  await page.getByRole('checkbox', { name: /localhost:3301/ }).click();
  await expect(page.getByRole('checkbox', { name: /localhost:3301/ })).not.toBeChecked();

  await uploadFiles(page, [file]);

  expect((await listBlobs(request, BLOSSOM_URL)).map(blob => blob.sha256)).toContain(sha256);
  // Deselecting has to actually keep the blob off the other server.
  expect((await listBlobs(request, BLOSSOM_REF_URL)).map(blob => blob.sha256)).not.toContain(sha256);
  expect((await request.get(`${BLOSSOM_URL}/${sha256}`)).ok()).toBe(true);

  await publishEvents(page, 1);

  const event = await fileEventFor(sha256);
  const origins = event.tags.filter(tag => tag[0] === 'url').map(tag => new URL(tag[1]).origin);
  expect(origins).toEqual([BLOSSOM_URL]);
});

test('fans one upload out to both blossom servers', async ({ page, request }) => {
  await startSession(page);

  const { file, sha256 } = uniqueUpload('multi');

  await uploadFiles(page, [file]);

  // Both implementations must hold the identical blob, addressed by the same hash.
  for (const server of [BLOSSOM_URL, BLOSSOM_REF_URL]) {
    expect((await listBlobs(request, server)).map(blob => blob.sha256), `blob missing on ${server}`).toContain(sha256);
    expect((await request.get(`${server}/${sha256}`)).ok(), `blob not served by ${server}`).toBe(true);
  }

  await publishEvents(page, 1);

  // One event, one hash, one url tag per server: that is what makes the blob
  // recoverable when a server disappears.
  const event = await fileEventFor(sha256);
  const origins = event.tags.filter(tag => tag[0] === 'url').map(tag => new URL(tag[1]).origin);
  expect(origins.sort()).toEqual([BLOSSOM_URL, BLOSSOM_REF_URL].sort());
});

test('keeps the copy on the second server when the size-capped server rejects the blob', async ({
  page,
  request,
}) => {
  await startSession(page);

  // 2 MB against almond's 1 MB cap (compose.yaml); the reference server accepts it.
  const { file, sha256 } = uniqueUpload('oversize', 2 * 1024 * 1024);

  await page.setInputFiles('#browse', [file]);
  await page.getByRole('button', { name: /^Upload 1 file/ }).click();

  // A partial failure must not look like success: the wizard stays on the upload
  // step, names the failing server, and offers the retry instead of publishing.
  // The toast text also lands in the live region, hence `first`.
  await expect(page.getByText('Upload completed with errors').first()).toBeVisible();
  // Whatever the wording, the rejecting status has to reach the user.
  await expect(page.getByText(/507/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry failed uploads' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Publish Nostr events' })).toHaveCount(0);

  // The rejection is real on one server and the upload still succeeded on the
  // other - a failed target must not roll back the copy that went through.
  expect((await listBlobs(request, BLOSSOM_URL)).map(blob => blob.sha256)).not.toContain(sha256);
  expect((await listBlobs(request, BLOSSOM_REF_URL)).map(blob => blob.sha256)).toContain(sha256);
  expect((await request.get(`${BLOSSOM_REF_URL}/${sha256}`)).ok()).toBe(true);
});

test('shows uploaded blobs on the browse view', async ({ page }) => {
  await startSession(page);

  const first = uniqueUpload('browse-a');
  const second = uniqueUpload('browse-b');

  await uploadFiles(page, [first.file, second.file]);
  await publishEvents(page, 2);
  await fileEventFor(first.sha256);
  await fileEventFor(second.sha256);

  // In-app navigation, not page.goto: an nsec login is deliberately never
  // persisted, so a reload would land back on the login screen.
  await page.getByRole('link', { name: 'Browse' }).click();
  await expect(page.getByRole('link', { name: /^Open details for browse-a/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /^Open details for browse-b/ })).toBeVisible();

  // The list view is the only one that prints hashes, and the hash is the only
  // identity a blob has - a matching title could come from the event alone.
  await page.getByRole('button', { name: 'List' }).click();
  await expect(page.getByText(first.sha256)).toBeVisible();
  await expect(page.getByText(second.sha256)).toBeVisible();

  // Both copies of each blob have to be visible as such, not just one.
  await expect(page.getByText(/2 copies/).first()).toBeVisible();
});

test('publishes a described nostr event and tracks it into the timeline', async ({ page }) => {
  await startSession(page);

  const { file, sha256 } = uniqueUpload('described');
  const caption = `Nesting box clip ${randomUUID()}`;

  await uploadFiles(page, [file]);

  // Step 3 is where the user writes the event: the caption becomes the kind 1063
  // content, which is what the timeline titles the item by.
  await page.getByLabel('Summary / Description').fill(caption);
  await publishEvents(page, 1);

  const event = await fileEventFor(sha256);
  expect(event.kind).toBe(1063);
  expect(event.content).toBe(caption);

  await page.getByRole('link', { name: 'Browse' }).click();
  // The row is titled by the event, not by the file name - so this asserts the
  // published event reached the timeline, not just the blob listing.
  await page.getByRole('link', { name: `Open details for ${caption}` }).click();

  // And that the item really hangs off that one event id, not another of the
  // run's events that happens to carry the same hash.
  await page.getByRole('button', { name: 'Open item actions' }).click();
  await page.getByRole('menuitem', { name: 'Raw event' }).click();
  await expect(page.getByRole('dialog').locator('pre')).toContainText(event.id);
  await expect(page.getByRole('dialog').locator('pre')).toContainText(sha256);
});

test('mirrors a blob from almond to the reference server via the sync page', async ({ page, request }) => {
  const { file, sha256 } = uniqueUpload('sync');
  // Seeded before login so the app's login-time listings already know it - the
  // sync page diffs exactly those listings.
  await seedBlob(request, BLOSSOM_URL, file);
  await startSession(page);

  await page.getByRole('link', { name: 'Sync' }).click();
  await page.getByRole('button', { name: 'Choose a source server' }).click();
  await page.getByRole('menuitemradio', { name: /localhost:3300/ }).click();
  await page.getByRole('button', { name: 'Select target server' }).click();
  await page.getByRole('menuitemradio', { name: /localhost:3301/ }).click();

  // The stack carries blobs from earlier tests in the run, so the missing count
  // can be greater than one - what matters is that our seeded blob is in the diff.
  await expect(page.getByText(/media files? missing on localhost:3301/)).toBeVisible();
  await page.getByRole('button', { name: 'Start sync' }).click();
  // Both servers implement BUD-04, so this runs as a real server-side mirror.
  // The sync page's own completion signal: the badge only appears once every job
  // finished without a failure.
  await expect(page.getByText('Complete', { exact: true })).toBeVisible();

  expect((await listBlobs(request, BLOSSOM_REF_URL)).map(blob => blob.sha256)).toContain(sha256);
  expect((await request.get(`${BLOSSOM_REF_URL}/${sha256}`)).ok()).toBe(true);

  // Back in Browse, the catalog has to reflect the second copy.
  await page.getByRole('link', { name: 'Browse' }).click();
  await page.getByRole('button', { name: 'List' }).click();
  await expect(page.getByText(/2 copies/).first()).toBeVisible();
});

test('retries a failed upload once the server is back', async ({ page, request }) => {
  await startSession(page);

  const { file, sha256 } = uniqueUpload('retry');
  // Simulate the outage in the browser instead of stopping the container: the
  // first request towards almond dies at the network layer, everything after
  // goes through. One abort covers the whole first attempt - the failure is the
  // app's to recover from, not the fixture's to keep producing.
  let almondDown = true;
  await page.route('**/localhost:3300/upload**', route => {
    if (almondDown) {
      almondDown = false;
      return route.abort('connectionreset');
    }
    return route.continue();
  });

  await page.setInputFiles('#browse', [file]);
  await page.getByRole('button', { name: /^Upload 1 file/ }).click();
  await expect(page.getByText('Upload completed with errors').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry failed uploads' })).toBeVisible();
  expect((await listBlobs(request, BLOSSOM_URL)).map(blob => blob.sha256)).not.toContain(sha256);

  await page.getByRole('button', { name: 'Retry failed uploads' }).click();
  await expect(page.getByRole('heading', { name: 'Publish Nostr events' })).toBeVisible();
  expect((await listBlobs(request, BLOSSOM_URL)).map(blob => blob.sha256)).toContain(sha256);

  await publishEvents(page, 1);
  const event = await fileEventFor(sha256);
  const origins = event.tags.filter(tag => tag[0] === 'url').map(tag => new URL(tag[1]).origin);
  expect(origins.sort()).toEqual([BLOSSOM_URL, BLOSSOM_REF_URL].sort());
});

test('deletes a published blob from every server', async ({ page, request }) => {
  // Seeded before login: the login-time listings then already hold the blob, so
  // every later listing re-ingest re-affirms the rows instead of racing them.
  const { file, sha256 } = uniqueUpload('delete-x');
  for (const server of [BLOSSOM_URL, BLOSSOM_REF_URL]) await seedBlob(request, server, file);
  await startSession(page);

  await publishToRelay([
    finalizeEvent(
      {
        kind: 1063,
        created_at: Math.floor(Date.now() / 1000),
        content: '',
        tags: [
          ['title', 'delete-x'],
          ['x', sha256],
          ['m', 'text/plain'],
          ['size', String(file.buffer.length)],
          ['url', `${BLOSSOM_URL}/${sha256}`],
          ['url', `${BLOSSOM_REF_URL}/${sha256}`],
        ],
      },
      SECRET_KEY
    ),
  ]);
  await fileEventFor(sha256);

  // The delete planner reads the catalog's location rows once, when the dialog
  // opens - gate it on both copies being recorded.
  await page.getByRole('link', { name: 'Browse' }).click();
  await waitForCatalogReplicas(page, sha256);
  await page.getByRole('checkbox', { name: `Select delete-x` }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  // The review step names the blast radius before anything is destroyed: the
  // app's delete removes the file from every server that holds it.
  await expect(page.getByRole('dialog').getByText('Delete 1 item')).toBeVisible();
  await expect(page.getByRole('dialog').getByText(/will be deleted from 2 servers/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete 1 file' })).toBeEnabled();
  await page.getByRole('button', { name: 'Delete 1 file' }).click();
  // The app closes the dialog itself once the run succeeded and the selection
  // cleared - waiting for it to disappear is the end-of-run signal. The server
  // assertions below are the real proof of what happened.
  await expect(page.getByRole('dialog')).toHaveCount(0);

  for (const server of [BLOSSOM_URL, BLOSSOM_REF_URL]) {
    expect((await listBlobs(request, server)).map(blob => blob.sha256)).not.toContain(sha256);
    expect((await request.get(`${server}/${sha256}`)).status(), `blob still served by ${server}`).toBe(404);
  }

  // The event survives, and the app says plainly that the files are gone.
  await expect(page.getByRole('link', { name: /^Open details for delete-x/ })).toBeVisible();
  await expect(page.getByLabel('Unavailable').first()).toBeVisible();
});

test('skips the transfer when the same bytes are uploaded again', async ({ page, request }) => {
  await startSession(page);

  const { file, sha256 } = uniqueUpload('dupe');
  await uploadFiles(page, [file]);
  await publishEvents(page, 1);

  // Remount the wizard and feed it the identical bytes. exists() has to answer
  // before any body moves: zero PUTs is the whole point of the second run.
  const uploadPuts: string[] = [];
  page.on('request', request => {
    if (request.method() === 'PUT' && new URL(request.url()).pathname === '/upload') uploadPuts.push(request.url());
  });

  // Close lands on Browse; only leaving the wizard unmounts it, so coming back
  // to /upload starts a fresh one instead of staying on the publish results.
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('link', { name: 'Upload' }).click();
  await page.setInputFiles('#browse', [file]);
  await page.getByRole('button', { name: /^Upload 1 file/ }).click();
  await expect(page.getByRole('heading', { name: 'Publish Nostr events' })).toBeVisible();
  expect(uploadPuts).toEqual([]);

  // One blob per server, no duplicate listing entries.
  for (const server of [BLOSSOM_URL, BLOSSOM_REF_URL]) {
    const hashes = (await listBlobs(request, server)).map(blob => blob.sha256).filter(hash => hash === sha256);
    expect(hashes, `duplicate blob on ${server}`).toHaveLength(1);
  }
});
