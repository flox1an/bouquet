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

## Configuration

### Image proxy

Thumbnails are generated through an image proxy. By default the public
[slidestr](https://images.slidestr.net) proxy is used. To use your own proxy,
set the `VITE_IMAGE_PROXY` environment variable (e.g. in a `.env` file) to a URL
template:

```bash
# .env
VITE_IMAGE_PROXY=https://my-proxy.example.com/insecure/f:webp/rs:fill:{size}/plain/{url}
```

Supported placeholders:

- `{url}` raw source image URL
- `{encodedUrl}` URL-encoded source image URL
- `{size}` requested thumbnail size in pixels

If neither `{url}` nor `{encodedUrl}` is present, the source URL is appended to
the end of the template. Set `VITE_IMAGE_PROXY=` (empty) to load images directly
without any proxy.

## Scripts

- `npm run dev` start Vite dev server
- `npm run build` type-check and production build
- `npm run lint` lint TypeScript/React code
- `npm run preview` preview built app
- `npm run format` run Prettier on `src/`
- `npm run analyze` inspect bundle composition

## Release Notes

- `nsite-cli` was removed from dependencies and scripts.
- Security audit currently reports `0 vulnerabilities` in this workspace.
- There are known lint warnings that do not block build output; see `RELEASE_CHECKLIST.md`.

## Docker

See [README.Docker.md](/Users/flox/dev/nostr/bouquet/README.Docker.md) for container build and run instructions.

