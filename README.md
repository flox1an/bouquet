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

## Release Notes

- `nsite-cli` was removed from dependencies and scripts.
- Security audit currently reports `0 vulnerabilities` in this workspace.
- There are known lint warnings that do not block build output; see `RELEASE_CHECKLIST.md`.

## Docker

See [README.Docker.md](/Users/flox/dev/nostr/bouquet/README.Docker.md) for container build and run instructions.

