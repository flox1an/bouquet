# shadcn/ui Rebuild Design

## Overview

Replace DaisyUI with shadcn/ui for better customization control and consistency with other apps. Full replacement approach (big bang), using shadcn's default neutral palette.

## Goals

- More control over component styling (DaisyUI too opinionated)
- Unified design system across multiple apps
- Simplified navigation (remove bottom nav)
- Improved file management UX

## Architecture

### Component Structure

```
src/
├── components/
│   ├── ui/              # shadcn primitives (button, input, dialog, etc.)
│   ├── layout/
│   │   └── TopNav.tsx   # Single responsive nav (replaces Navbar + BottomNavBar)
│   ├── files/
│   │   ├── FileList.tsx      # Unified list (replaces BlobList variants)
│   │   ├── FileCard.tsx      # Grid view item
│   │   ├── FileRow.tsx       # Table/list view item
│   │   ├── FileFilters.tsx   # Filter bar with search, type, date
│   │   └── FileActions.tsx   # Batch action toolbar
│   ├── servers/
│   │   └── ServerSelector.tsx
│   └── upload/
│       └── UploadFlow.tsx    # Consolidated upload UI
```

### shadcn Components Needed

- Button, Input, Select, Checkbox
- Dialog, Sheet (mobile nav), DropdownMenu
- Table, Card
- Command (for search/filters)
- Popover, Calendar (date filtering)
- Toast (notifications)
- Skeleton (loading states)
- Slider (audio player)
- Collapsible (upload options)

## Navigation

### TopNav (Desktop md+)

```
┌─────────────────────────────────────────────────────────────┐
│  Bouquet     Upload   Browse   Sync      [Server ▾] [User] │
└─────────────────────────────────────────────────────────────┘
```

- Logo/brand left
- Main nav links center-left (Upload, Browse, Sync)
- Server selector dropdown right
- User menu far right (contains theme toggle)

### TopNav (Mobile)

```
┌─────────────────────────────────────────────────┐
│  Bouquet                            [Menu]     │
└─────────────────────────────────────────────────┘
```

- Hamburger opens shadcn Sheet (slide-in drawer)
- Sheet contains: nav links, server selector, theme toggle, account
- No bottom navigation bar

## File Management

### View Modes

Toggle between three views:
- **Grid**: Cards with thumbnails (good for images/videos)
- **List**: Compact rows (good for documents/scanning)
- **Table**: Full details with sortable columns

### Selection & Batch Actions

```
┌────────────────────────────────────────────────────────────┐
│ ☑ 3 selected    [Delete] [Sync to...] [Download]    [✕]   │
└────────────────────────────────────────────────────────────┘
```

- Checkbox on each file item
- "Select all" in header
- Floating action bar when files selected
- Actions: delete, sync to another server, download, edit metadata

### Filtering & Search

```
┌────────────────────────────────────────────────────────────┐
│ Search files...   [Type ▾] [Date ▾]  [Grid│List│Table]    │
└────────────────────────────────────────────────────────────┘
```

- Instant search (filters as you type)
- Type filter: All, Images, Videos, Audio, Documents
- Date filter: Any time, Today, This week, This month, Custom range

## Page Layouts

### Browse Page

```
┌──────────────────────────────────────────────────┐
│ TopNav                                           │
├──────────────────────────────────────────────────┤
│ Filter Bar (search, type, date, view toggle)     │
├──────────────────────────────────────────────────┤
│ FileList (grid/list/table based on toggle)       │
│ - Pagination or infinite scroll at bottom        │
├──────────────────────────────────────────────────┤
│ [Selection Action Bar - when files selected]     │
└──────────────────────────────────────────────────┘
```

### Upload Page

```
┌──────────────────────────────────────────────────┐
│ TopNav                                           │
├──────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────┐      │
│  │  Drop files here or click to browse    │      │
│  └────────────────────────────────────────┘      │
│                                                  │
│  ─── Upload Settings ───────────────────────     │
│                                                  │
│  Servers:  ☑ blossom.oxtr.dev                    │
│            ☑ cdn.satellite.earth                 │
│            ☐ nostr.build                         │
│            [+ Add server]                        │
│                                                  │
│  Image Options:                                  │
│    ☐ Resize images    [Max width: 1920 ▾]        │
│    ☐ Convert to       [WebP ▾]                   │
│    ☐ Strip metadata                              │
│                                                  │
│  ─── Queued Files ──────────────────────────     │
│                                                  │
│  photo.jpg  2.4MB  [Remove]                      │
│     └─ Resize to 1920px, convert to WebP         │
│  doc.pdf    840KB  [Remove]                      │
│                                                  │
│  [Upload All]  [Clear]                           │
└──────────────────────────────────────────────────┘
```

### Sync Page

```
┌──────────────────────────────────────────────────┐
│ TopNav                                           │
├──────────────────────────────────────────────────┤
│  Source: [Server A ▾]    →    Target: [Server B ▾] │
├──────────────────────────────────────────────────┤
│  FileList (source server files, multi-select)    │
│                                                  │
│  [Sync Selected →]                               │
└──────────────────────────────────────────────────┘
```

### Check Page

```
┌──────────────────────────────────────────────────┐
│ TopNav                                           │
├──────────────────────────────────────────────────┤
│  Verify Blobs on: [Server ▾]                     │
├──────────────────────────────────────────────────┤
│  FileList showing verification status:           │
│                                                  │
│  ✓ image.jpg     OK                              │
│  ✗ video.mp4     Missing on server               │
│  ⟳ doc.pdf       Checking...                     │
│                                                  │
│  [Re-check Failed] [Sync Missing →]              │
└──────────────────────────────────────────────────┘
```

## Additional UI Elements

### Dialogs & Modals

- File metadata editor (Dialog)
- Confirmation dialogs for destructive actions
- Server add/edit modal

### Feedback & States

- Toast notifications for success/error
- Loading skeletons
- Empty states with helpful prompts

### Dark Mode

- shadcn CSS variable approach
- Toggle in user menu
- Respects system preference by default

### Audio Player

- Floating player at bottom when audio playing
- Slider for progress, Button for controls

## Migration Steps

1. Init shadcn, remove DaisyUI from tailwind config
2. Add shadcn base components (button, input, etc.)
3. Build TopNav with Sheet for mobile
4. Build FileList with view modes and selection
5. Build FileFilters with Command search
6. Rebuild Upload page with server selection and image options
7. Rebuild Sync page with source/target selection
8. Rebuild Check page with status indicators
9. Add Toast notifications throughout
10. Style audio player with shadcn components
11. Test responsive behavior
12. Remove old DaisyUI components
