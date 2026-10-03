# Bouquet

Bouquet is a web app for managing media blobs across Blossom and NIP-96 servers.
It supports upload, browsing, deletion, and server-to-server sync workflows.

## Features

- Upload files to one or more servers
- Browse blobs by server, including a virtual `All servers` view
- Delete blobs from selected servers (including multi-server delete from `All servers`)
- Sync missing blobs from one server to another
- Manage Blossom and NIP-96 servers in-app

## Tech Stack

- React 18 + TypeScript + Vite
- TanStack Query
- Radix UI primitives + local UI components
- Tailwind CSS
- Nostr tooling (`nostr-tools`, Applesauce stack)

## Requirements

- Node.js 20+ recommended
- npm 10+ recommended

## Local Development

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Build production assets:

```bash
npm run build
```

Run lint checks:

```bash
npm run lint
```

Preview production build locally:

```bash
npm run preview
```

Run integration tests (needs Docker):

```bash
npm run test:e2e
```

`test/e2e` starts an ephemeral stack in Docker Compose - a `nostr-rs-relay` plus two
empty Blossom servers, [almond](https://github.com/flox1an/almond) and the
[reference implementation](https://github.com/hzrd149/blossom-server), so uploads
fanning out to several servers are covered - seeds the relay with a fixed test
identity plus its server list, points the dev server at the local relay via
`VITE_RELAYS`, and drives the app in headless Chromium. Everything is torn down
afterwards, so runs never share state.

## Scripts

- `npm run dev` start Vite dev server
- `npm run build` type-check and production build
- `npm run lint` lint TypeScript/React code
- `npm run preview` preview built app
- `npm run test` run unit tests (vitest)
- `npm run test:e2e` run Docker-backed integration tests (Playwright)
- `npm run format` run Prettier on `src/`
- `npm run analyze` inspect bundle composition

## Environment Variables

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_DISABLE_EVENT_PUBLISH` | unset | Set to `1` to skip broadcasting file/audio/video Nostr events (kind 1063/31137/34235/34236) to relays. Events are still signed; useful for local testing without polluting your feed. |
| `VITE_RELAYS` | unset | Comma-separated relay list replacing the built-in defaults. Used by the integration tests to talk to a local relay only. |
| `VITE_IMAGE_PROXY` | `https://images.slidestr.net/insecure/f:webp/rs:fill:{size}/plain/{url}` | Plain image-resizing proxy URL template. Placeholders: `{url}` (raw source URL), `{encodedUrl}` (URL-encoded source URL), `{size}` (edge size in px). With neither `{url}` nor `{encodedUrl}` the source URL is appended. Set to an empty value to load images directly without a proxy. Used by the upload-flow previews always, and by the gallery when `VITE_THUMBNAIL_PROXY=plain`. |
| `VITE_THUMBNAIL_PROXY` | `nostube` | Which proxy implementation the Browse/Timeline gallery uses for thumbnails: `nostube` (signed imgproxy preset, extracts video frames and audio artwork), `plain` (the `VITE_IMAGE_PROXY` template above — images only, no video thumbnails), or `off` (load original URLs directly). |
| `VITE_NOSTUBE_IMAGE_PROXY_BASE_URL` | `https://imgproxy.nostu.be` | Base URL of the nostube-compatible imgproxy used when `VITE_THUMBNAIL_PROXY=nostube`. Point it at a self-hosted, nostube-compatible proxy (the `/v1/preset/feed-preview-v1/` signing preset must exist there). An empty value disables gallery proxying. |

These `VITE_*` settings are applied at **build time**. Set them in `.env.local`
before building (or before starting the dev server); changing a running
container's environment does not change an already-built frontend.

For a self-hosted image-only resizing proxy:

```dotenv
VITE_THUMBNAIL_PROXY=plain
VITE_IMAGE_PROXY=https://resize.example/insecure/f:webp/rs:fill:{size}/plain/{url}
```

For a self-hosted Nostube-compatible proxy with video/audio extraction:

```dotenv
VITE_THUMBNAIL_PROXY=nostube
VITE_NOSTUBE_IMAGE_PROXY_BASE_URL=https://nostube-proxy.example
```

Set `VITE_THUMBNAIL_PROXY=off` to disable gallery proxying. Upload previews use
`VITE_IMAGE_PROXY` independently; set `VITE_IMAGE_PROXY=` to disable those too.

## Release Notes

- `nsite-cli` was removed from dependencies and scripts.
- Security audit currently reports `0 vulnerabilities` in this workspace.
- There are known lint warnings that do not block build output; see `RELEASE_CHECKLIST.md`.

## Docker

See [README.Docker.md](/Users/flox/dev/nostr/bouquet/README.Docker.md) for container build and run instructions.

