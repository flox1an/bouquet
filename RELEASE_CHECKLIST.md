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

## Current Known Items

- Lint warnings still exist, mainly around hook dependencies and migration leftovers.
- Build warns about large chunks; this is currently accepted for the present usage profile.

