# Bouquet - Droid Context Document

## Project Overview

**Bouquet** is a web application for managing content on Blossom servers. It provides functionality for uploading, browsing, transferring, and managing media blobs (images, audio, video, documents) on the Nostr network using the Blossom protocol.

**Live URL**: bouquet.slidestr.net  
**Version**: 0.0.1  
**Tech Stack**: React 19 + TypeScript + Vite + TailwindCSS + DaisyUI

---

## Architecture & Key Technologies

### Frontend Framework
- **React 19.0.0** with **TypeScript 5.8.2**
- **Vite 6.2.2** as build tool and dev server
- **React Router DOM 7.3.0** for routing
- **SWC** for fast React compilation

### UI/Styling
- **TailwindCSS 3.4.17** with **@tailwindcss/vite 4.0.14**
- **DaisyUI 4.10.1** component library
- Custom themes: `mydark` and `mylight` (see `tailwind.config.ts`)
- PostCSS with Autoprefixer

### State Management
- **@tanstack/react-query 5.68.0** for server state management
- **Global Context** (`GlobalState.tsx`) for audio player state
- **NDK Context** (`ndk.tsx`) for Nostr connection and authentication
- Local storage utilities for persistent user preferences

### Nostr/Blossom Integration
- **@nostr-dev-kit/ndk 2.12.2** - Nostr Development Kit for Nostr protocol
- **@nostr-dev-kit/ndk-cache-dexie 2.5.15** - IndexedDB caching for NDK
- **nostr-tools 2.11.0** - Lower-level Nostr utilities
- **blossom-client-sdk 3.0.1** - Client SDK for Blossom server protocol
- **@noble/hashes 1.7.1** - Cryptographic hashing

### Media Processing
- **@catamphetamine/id3js 1.0.2** - ID3 tag extraction for audio files
- **blurhash 2.0.5** - Placeholder image generation
- **react-pdf 9.2.1** - PDF rendering and preview
- FFmpeg 8.0 available in environment for video processing

### HTTP & Utilities
- **axios 1.8.3** - HTTP client with upload/download progress tracking
- **dayjs 1.11.13** - Date manipulation
- **lodash 4.17.21** - Utility functions
- **p-limit 6.2.0** - Concurrency control

### Code Quality
- **ESLint 9.22.0** with TypeScript and React plugins
- **Prettier 3.5.3** for code formatting
- Strict TypeScript configuration with all linting enabled

---

## Project Structure

```
bouquet/
├── src/
│   ├── main.tsx                    # Entry point, routing, providers
│   ├── GlobalState.tsx             # Global state for audio player
│   ├── index.css                   # Global styles
│   │
│   ├── pages/                      # Route pages
│   │   ├── Upload.tsx              # Main upload interface
│   │   ├── Home.tsx                # Browse/list blobs
│   │   ├── Transfer.tsx            # Transfer/sync between servers
│   │   └── Check.tsx               # Check/verify blobs
│   │
│   ├── components/                 # React components
│   │   ├── Layout/                 # Layout and Login
│   │   ├── BlobList/               # Generic blob listing with type filtering
│   │   ├── AudioBlobList/          # Audio-specific blob list
│   │   ├── VideoBlobList/          # Video-specific blob list
│   │   ├── ImageBlobList/          # Image-specific blob list
│   │   ├── DocumentBlobList/       # Document-specific blob list
│   │   ├── FileEventEditor/        # Editor for file metadata events
│   │   ├── ServerList/             # Server management UI
│   │   ├── ServerListPopup/        # Server selection popup
│   │   ├── AudioPlayer.tsx         # Audio playback component
│   │   ├── UploadProgress.tsx      # Upload progress tracking
│   │   ├── UploadFileSelection.tsx # File selection UI
│   │   ├── UploadPublished.tsx     # Post-upload publishing
│   │   ├── ThemeSwitcher.tsx       # Dark/light theme toggle
│   │   ├── BlurImage.tsx           # Blurhash image placeholder
│   │   ├── MimeTypeIcon.tsx        # File type icons
│   │   ├── TagInput.tsx            # Tag input component
│   │   ├── CheckBox/               # Custom checkbox
│   │   ├── ProgressBar/            # Progress bar component
│   │   └── BottomNavBar/           # Bottom navigation
│   │
│   └── utils/                      # Utility functions and hooks
│       ├── ndk.tsx                 # NDK context provider & auth
│       ├── blossom.ts              # Blossom protocol utilities
│       ├── nip96.ts                # NIP-96 (HTTP File Storage) utilities
│       ├── transfer.ts             # Blob transfer logic
│       ├── id3.ts                  # ID3 tag parsing
│       ├── exif.ts                 # EXIF data extraction
│       ├── blur.ts                 # Blurhash generation
│       ├── resize.ts               # Image resizing
│       ├── genres.ts               # Music genre list
│       ├── utils.ts                # General utilities
│       ├── useEvent.ts             # Hook for single Nostr event
│       ├── useEvents.ts            # Hook for multiple Nostr events
│       ├── useFileMetaEvents.ts    # Hook for file metadata events
│       ├── useBlossomServerEvents.ts # Hook for Blossom server events
│       ├── useUserServers.ts       # Hook for user's server list
│       ├── useServerInfo.ts        # Hook for server information
│       └── useLocalStorageState.ts # Persistent state hook
│
├── public/                         # Static assets
├── dist/                           # Build output
├── node_modules/                   # Dependencies
│
├── index.html                      # HTML entry point
├── package.json                    # Dependencies and scripts
├── tsconfig.json                   # TypeScript configuration
├── vite.config.ts                  # Vite configuration
├── tailwind.config.ts              # Tailwind configuration
├── postcss.config.js               # PostCSS configuration
├── vercel.json                     # Vercel deployment config
├── README.md                       # Project documentation
├── TODO.md                         # Bug tracking and todos
└── userstories.md                  # Use cases and requirements
```

---

## Core Functionality

### 1. Authentication (NDK Context)
Located in `src/utils/ndk.tsx`, provides multiple login methods:
- **NIP-07 Extension** (browser extension like Alby, Nos2x)
- **NIP-46 Remote Signer** (Nostr Connect/bunker://)
- **Private Key** (nsec/ncryptsec with password)
- Auto-login on subsequent visits

Default relays used:
- wss://relay.damus.io
- wss://relay.nostr.band
- wss://relay.snort.social
- wss://nos.lol
- wss://nostr.wine
- wss://relay.primal.net
- wss://purplepag.es/

### 2. Blossom Protocol Integration
Located in `src/utils/blossom.ts`, provides:
- **Upload**: Upload files to Blossom servers with auth
- **List**: Fetch user's blob list from server
- **Mirror**: Copy blobs between servers
- **Download**: Download blobs with progress tracking
- URL parsing and hash extraction

### 3. Upload Flow (`src/pages/Upload.tsx`)
1. File selection (drag & drop or file picker)
2. Metadata extraction (ID3 for audio, EXIF for images)
3. Blurhash generation for images
4. Server selection (multiple servers supported)
5. Upload with progress tracking
6. Optional Nostr event publishing (kind 1063, 31137, etc.)

### 4. Browse/List (`src/pages/Home.tsx`)
- View all blobs across servers
- Filter by type (images, audio, video, documents)
- Type-specific list components with rich metadata
- Batch operations (selection, deletion)

### 5. Transfer/Sync (`src/pages/Transfer.tsx`)
- Copy blobs between servers
- Bulk transfer operations
- Mirror functionality for efficient copying

### 6. File Metadata Events
Supports multiple Nostr event kinds:
- **Kind 1063**: Generic file metadata
- **Kind 31137**: Audio tracks
- **Kind 30029**: Playlists/albums
- **Kind 34235**: Horizontal video (16:9)
- **Kind 34236**: Vertical video (TikTok-style)
- **Kind 30388**: Image slide sets

---

## Development Workflow

### Available Scripts
```bash
npm run dev        # Start dev server (Vite)
npm run build      # Type-check + build for production
npm run lint       # ESLint code quality check
npm run format     # Format code with Prettier
npm run preview    # Preview production build
npm run analyze    # Analyze bundle size
npm run deploy     # Build + deploy to nsite
```

### Build Process
1. TypeScript compilation (`tsc`)
2. Vite build (bundling, minification)
3. Output to `dist/` directory

### Code Style
- TypeScript strict mode enabled
- ESLint with React and TypeScript rules
- Prettier formatting
- DaisyUI component conventions
- React hooks patterns

---

## Key Dependencies & Their Usage

### Nostr Ecosystem
- **NDK**: High-level Nostr client with caching and relay management
- **nostr-tools**: Low-level utilities (nip19 encoding, event signing)
- **blossom-client-sdk**: Blossom protocol implementation

### Media Processing
- **ID3.js**: Extract artist, title, album, year from audio files
- **blurhash**: Generate compact image placeholders
- **react-pdf**: Render PDF previews

### State & Queries
- **React Query**: Async state management, caching, refetching
- **React Context**: Global state (audio player, NDK auth)

### UI Components
- **DaisyUI**: Pre-built Tailwind components (buttons, cards, modals)
- **Heroicons**: Icon library (@heroicons/react)

---

## Configuration Files

### TypeScript (`tsconfig.json`)
- Target: ES2020
- Module: ESNext (bundler mode)
- Strict mode enabled
- JSX: react-jsx (new JSX transform)

### Vite (`vite.config.ts`)
- React plugin with SWC
- Build output: `dist/`
- Dev server default port: 5173

### Tailwind (`tailwind.config.ts`)
- Custom DaisyUI themes (mydark, mylight)
- Content paths: `index.html`, `src/**/*.{js,ts,jsx,tsx}`
- Primary color: #be185d (pink)
- Secondary color: #2563eb (blue)

### Git
- Branch: `main`
- Modified files: .gitignore, index.html, package files, several source files
- Recent commits focus on package updates, relay fixes, and styling

---

## Known Issues & TODOs

From `TODO.md`:
- 403 errors from "nogood" server should display better error messages
- Delete functionality broken in ALL SERVERS view

From `userstories.md` and code comments:
- Album art upload from ID3 tags
- Album art as separate blob
- Video preview generation
- PDF metadata extraction
- Dimensions and blurhash for images
- Audio player like SoundCloud
- Blob selection → Delete Selected
- Display blob as "published" when in Audio Event, else "unlisted"

---

## Use Cases

### Primary User Personas
1. **Primal Web User**: Upload images to multiple servers for posting
2. **General User**: Share arbitrary files (kind 1063) publicly
3. **Photographer**: Upload image albums (kind 30388 slide sets)
4. **Video Creator**: Upload horizontal videos (kind 34235)
5. **TikTok User**: Upload vertical videos (kind 34236)
6. **Music Creator**: Upload single audio tracks (kind 31137)
7. **Music Collector**: Upload complete albums with metadata (playlist kind 30029)

---

## Environment & Tooling

- **Node/npm**: For package management
- **Bun**: Lockfile present (`bun.lockb`) - alternative runtime
- **Git**: Version control
- **FFmpeg 8.0**: Video processing (available in environment)
- **Ripgrep 14.1.1**: Fast code search
- **Vercel**: Deployment platform

---

## Important Patterns

### Custom Hooks
- `useEvent(id)`: Fetch single Nostr event
- `useEvents(filter)`: Fetch multiple Nostr events
- `useFileMetaEvents(hash)`: Get file metadata events for a hash
- `useUserServers()`: Get user's configured Blossom servers
- `useLocalStorageState(key, default)`: Persistent state

### Authentication Flow
1. Check localStorage for `auto-login` preference
2. Restore session (NIP-07, NIP-46, or private key)
3. Fetch user profile from Nostr
4. Set NDK signer globally

### Upload Flow
1. Select files
2. Extract metadata (ID3, EXIF)
3. Generate blurhash (images)
4. Select target servers
5. Upload with auth (Blossom protocol)
6. Optionally publish Nostr event

### Event Signing
- All Nostr events signed via NDK context
- `signEventTemplate()` function wraps NDK signing
- `publishSignedEvent()` publishes to relays

---

## Testing & Verification

### Before Completing Tasks
1. Run `npm run lint` - Check for ESLint errors
2. Run `npm run build` - Ensure TypeScript compiles
3. Check browser console for runtime errors
4. Test affected functionality in UI

### No Test Suite
- No automated tests configured yet
- Manual testing required

---

## Deployment

- Deploy script: `npm run deploy`
- Deployment target: `nsite-cli upload dist`
- Platform: Likely Vercel (vercel.json present)

---

## Additional Notes

- Project uses both `package-lock.json` (npm) and `bun.lockb` (bun)
- Modified files in working directory (not committed)
- React 19 is latest stable version (released recently)
- NDK caching uses IndexedDB via Dexie
- Explicit relay URLs configured for reliability
- Support for multiple authentication methods increases accessibility

---

## Quick Reference

### Start Development
```bash
npm run dev
# or
bun dev
```

### Build for Production
```bash
npm run build
```

### Code Quality
```bash
npm run lint
npm run format
```

### Key Files to Modify
- **Add new page**: Create in `src/pages/`, add route to `src/main.tsx`
- **Add component**: Create in `src/components/`
- **Add utility**: Create in `src/utils/`
- **Modify theme**: Edit `tailwind.config.ts`
- **Modify build**: Edit `vite.config.ts`

### Important Context Providers
All components have access to:
- `NDKContext` (Nostr connection, user, auth)
- `GlobalContext` (audio player state)
- `QueryClient` (React Query cache)

---

**Last Updated**: 2025-11-02  
**Analyzed By**: Droid AI Assistant
