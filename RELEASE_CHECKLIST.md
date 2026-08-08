# Release Checklist

## 1. Code Health

- [ ] `npm install` runs cleanly
- [ ] `npm run build` succeeds
- [ ] `npm run lint` succeeds (warnings reviewed and accepted)
- [ ] `npm audit` reports no blocking vulnerabilities

## 2. Functional Smoke Test

- [ ] Login and auto-login flow works as expected
- [ ] Upload works for primary workflows
- [ ] Upload error handling is visible (401/403/404/5xx)
- [ ] Browse works for single server and `All servers`
- [ ] Delete works from single server and `All servers`
- [ ] Sync flow works (source/target selection, progress, completion, error display)

## 3. UI / UX Readiness

- [ ] Server management dialog handles long URLs cleanly
- [ ] Empty states are clear (no selection, no files, no transfer jobs)
- [ ] No placeholder text or non-functional UI actions are exposed
- [ ] Sync page layout is readable on desktop and mobile widths

## 4. Build & Bundle

- [ ] Bundle reviewed with `npm run analyze` if size changed significantly
- [ ] Main chunk size acceptable for expected traffic profile
- [ ] Document/PDF loading behavior validated in runtime

## 5. Release Metadata

- [ ] `package.json` version updated for release
- [ ] Changelog/release notes prepared
- [ ] Any known limitations explicitly documented

## 6. Deployment

- [ ] Deployment method confirmed (no `nsite-cli` workflow in this repo)
- [ ] Production environment variables/config validated
- [ ] Post-deploy smoke test completed

## 7. Smoke Test That Only a Signed-In User Can Run

These cannot be verified from the codebase alone. Run them against real servers
with a real key before announcing a release.

- [ ] Sign in, confirm Browse lists your assets with no server selected
- [ ] An HLS video appears as exactly one entry, segments only in its detail view
- [ ] Search a sha256 prefix (8+ chars) and find the owning asset
- [ ] Mirror one asset to a second server; confirm the plan count matches what is
      actually missing, and that the replica count increases afterwards without a
      manual reload
- [ ] Cancel a mirror mid-run, re-run it, and confirm completed blobs are skipped
- [ ] Sync an asset and confirm every blob lands on every configured server
- [ ] Delete an asset and confirm removal from every server that reported it,
      with per-server errors shown if any server refuses
- [ ] Confirm delete is blocked, with a visible reason, on an asset whose graph
      is incomplete
- [ ] Open an event's njump link and confirm it resolves to the real post
- [ ] Sync lists your media by event title, not by hash, and files with no event
      are marked as such rather than looking broken
- [ ] A file referenced by an event shows the SAME title in Browse and in Sync
- [ ] Visiting / lands on Browse, and a brand-new account is offered a server
      rather than an empty screen
- [ ] Uncheck a server during onboarding and confirm it is NOT saved
- [ ] Log out from a phone-width window
- [ ] Force a failure (stop a server mid-run) and confirm the dialog reports it
      and still lets you close

## Current Known Items

- Lint warnings still exist (0 errors, 28 warnings), mainly hook dependencies.
- Build warns about a ~1.0 MB main chunk (~330 kB gzipped); accepted for the
  present usage profile, with routes already lazy-loaded.
- Mirror and sync target Blossom servers; NIP-96 destinations are only reached
  through the upload fallback.
- A cancelled transfer run has no persisted job state; re-running the action is
  the resume path and skips completed blobs.

