import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { NostrEvent } from 'nostr-tools';
import {
  BLOSSOM_REF_URL,
  BLOSSOM_URL,
  PUBKEY,
  listBlobs,
  login,
  queryRelay,
  uniqueUpload,
  type UploadFixture,
} from './fixtures';

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

test.beforeEach(async ({ page }) => {
  await page.goto('/upload');
  await login(page);
  // The checkboxes only render once the seeded kind 10063 list arrives from the
  // ephemeral relay - proof the relay round trip works. Both are pre-selected.
  await expect(page.getByRole('checkbox', { name: /localhost:3300/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /localhost:3301/ })).toBeChecked();
});

test('uploads to a single selected server and publishes the file event', async ({ page, request }) => {
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
