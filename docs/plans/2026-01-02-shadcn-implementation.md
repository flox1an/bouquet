# shadcn/ui Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace DaisyUI with shadcn/ui for better customization and cross-app consistency.

**Architecture:** Big bang replacement - init shadcn, build new components, rebuild all pages, remove DaisyUI. Unified FileList component with view modes, simplified top-only navigation.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui (Radix primitives), lucide-react icons

---

## Phase 1: Setup

### Task 1: Install shadcn Dependencies

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`

**Step 1: Add path alias to tsconfig.json**

Add `baseUrl` and `paths` to compilerOptions:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

**Step 2: Install dependencies**

Run:
```bash
npm install tailwindcss-animate class-variance-authority clsx tailwind-merge lucide-react
npm install -D @types/node
```

**Step 3: Update vite.config.ts for path alias**

Add resolve alias:

```typescript
import path from "path"
import react from "@vitejs/plugin-react-swc"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
```

**Step 4: Commit**

```bash
git add -A && git commit -m "chore: add shadcn dependencies and path aliases"
```

---

### Task 2: Configure shadcn

**Files:**
- Create: `components.json`
- Modify: `tailwind.config.ts`
- Modify: `src/index.css`
- Create: `src/lib/utils.ts`

**Step 1: Create components.json**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

**Step 2: Create src/lib/utils.ts**

```typescript
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

**Step 3: Update tailwind.config.ts**

```typescript
import type { Config } from "tailwindcss"
import tailwindcssAnimate from "tailwindcss-animate"

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
    },
  },
  plugins: [tailwindcssAnimate],
}

export default config
```

**Step 4: Update src/index.css with shadcn CSS variables**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 0 0% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 0 0% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 0 0% 3.9%;
    --primary: 0 0% 9%;
    --primary-foreground: 0 0% 98%;
    --secondary: 0 0% 96.1%;
    --secondary-foreground: 0 0% 9%;
    --muted: 0 0% 96.1%;
    --muted-foreground: 0 0% 45.1%;
    --accent: 0 0% 96.1%;
    --accent-foreground: 0 0% 9%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 89.8%;
    --input: 0 0% 89.8%;
    --ring: 0 0% 3.9%;
    --radius: 0.5rem;
    --chart-1: 12 76% 61%;
    --chart-2: 173 58% 39%;
    --chart-3: 197 37% 24%;
    --chart-4: 43 74% 66%;
    --chart-5: 27 87% 67%;
  }

  .dark {
    --background: 0 0% 3.9%;
    --foreground: 0 0% 98%;
    --card: 0 0% 3.9%;
    --card-foreground: 0 0% 98%;
    --popover: 0 0% 3.9%;
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 0 0% 9%;
    --secondary: 0 0% 14.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 0 0% 14.9%;
    --muted-foreground: 0 0% 63.9%;
    --accent: 0 0% 14.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 0 0% 14.9%;
    --input: 0 0% 14.9%;
    --ring: 0 0% 83.1%;
    --chart-1: 220 70% 50%;
    --chart-2: 160 60% 45%;
    --chart-3: 30 80% 55%;
    --chart-4: 280 65% 60%;
    --chart-5: 340 75% 55%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    overflow-x: hidden;
    width: 100%;
    box-sizing: border-box;
  }
}
```

**Step 5: Commit**

```bash
git add -A && git commit -m "chore: configure shadcn with CSS variables and utils"
```

---

### Task 3: Add Base shadcn Components

**Files:**
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/checkbox.tsx`
- Create: `src/components/ui/select.tsx`
- Create: `src/components/ui/dialog.tsx`
- Create: `src/components/ui/sheet.tsx`
- Create: `src/components/ui/dropdown-menu.tsx`
- Create: `src/components/ui/card.tsx`
- Create: `src/components/ui/table.tsx`
- Create: `src/components/ui/skeleton.tsx`
- Create: `src/components/ui/slider.tsx`
- Create: `src/components/ui/progress.tsx`
- Create: `src/components/ui/badge.tsx`
- Create: `src/components/ui/toast.tsx`
- Create: `src/components/ui/toaster.tsx`
- Create: `src/components/ui/use-toast.ts`
- Create: `src/components/ui/collapsible.tsx`

**Step 1: Run shadcn add commands**

```bash
npx shadcn@latest add button input checkbox select dialog sheet dropdown-menu card table skeleton slider progress badge toast collapsible --yes
```

**Step 2: Verify components created**

Run: `ls src/components/ui/`

Expected: All component files present

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add shadcn base UI components"
```

---

## Phase 2: Layout Components

### Task 4: Create TopNav Component

**Files:**
- Create: `src/components/layout/TopNav.tsx`
- Create: `src/components/layout/MobileNav.tsx`

**Step 1: Create TopNav.tsx**

```tsx
import { Link, useLocation } from "react-router-dom"
import { Menu, Upload, FolderOpen, RefreshCw, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ServerSelector } from "@/components/servers/ServerSelector"
import { ThemeToggle } from "@/components/layout/ThemeToggle"
import { cn } from "@/lib/utils"

const navItems = [
  { to: "/upload", label: "Upload", icon: Upload },
  { to: "/browse", label: "Browse", icon: FolderOpen },
  { to: "/sync", label: "Sync", icon: RefreshCw },
]

export function TopNav() {
  const location = useLocation()

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        {/* Logo */}
        <Link to="/" className="mr-6 flex items-center space-x-2">
          <span className="text-xl">🌸</span>
          <span className="font-bold">Bouquet</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center space-x-6 text-sm font-medium">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "transition-colors hover:text-foreground/80",
                location.pathname === item.to
                  ? "text-foreground"
                  : "text-foreground/60"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right Side */}
        <div className="flex flex-1 items-center justify-end space-x-2">
          <div className="hidden md:flex items-center space-x-2">
            <ServerSelector />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Profile</DropdownMenuItem>
                <DropdownMenuItem>Settings</DropdownMenuItem>
                <DropdownMenuItem>Logout</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Mobile Menu */}
          <Sheet>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px]">
              <MobileNav />
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}

function MobileNav() {
  const location = useLocation()

  return (
    <div className="flex flex-col space-y-4 mt-4">
      <nav className="flex flex-col space-y-2">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex items-center space-x-2 px-2 py-2 rounded-md transition-colors",
              location.pathname === item.to
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent/50"
            )}
          >
            <item.icon className="h-5 w-5" />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      <div className="border-t pt-4">
        <p className="text-sm text-muted-foreground mb-2">Server</p>
        <ServerSelector />
      </div>
      <div className="border-t pt-4 flex items-center justify-between">
        <span className="text-sm">Theme</span>
        <ThemeToggle />
      </div>
    </div>
  )
}
```

**Step 2: Create ThemeToggle.tsx**

```tsx
import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/hooks/use-theme"

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme}>
      {theme === "dark" ? (
        <Sun className="h-5 w-5" />
      ) : (
        <Moon className="h-5 w-5" />
      )}
    </Button>
  )
}
```

**Step 3: Create use-theme hook**

Create `src/hooks/use-theme.ts`:

```typescript
import { useState, useEffect } from "react"

type Theme = "light" | "dark"

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem("theme") as Theme
    if (stored) return stored
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
  })

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove("light", "dark")
    root.classList.add(theme)
    localStorage.setItem("theme", theme)
  }, [theme])

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"))

  return { theme, setTheme, toggleTheme }
}
```

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add TopNav with responsive mobile menu"
```

---

### Task 5: Create ServerSelector Component

**Files:**
- Create: `src/components/servers/ServerSelector.tsx`

**Step 1: Create ServerSelector.tsx**

```tsx
import { Check, ChevronsUpDown, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useServers } from "@/hooks/use-servers"

export function ServerSelector() {
  const { servers, selectedServer, setSelectedServer } = useServers()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="w-[200px] justify-between">
          <span className="truncate">
            {selectedServer?.name || "Select server"}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[200px]">
        {servers.map((server) => (
          <DropdownMenuItem
            key={server.url}
            onClick={() => setSelectedServer(server)}
          >
            <Check
              className={cn(
                "mr-2 h-4 w-4",
                selectedServer?.url === server.url
                  ? "opacity-100"
                  : "opacity-0"
              )}
            />
            <span className="truncate">{server.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Plus className="mr-2 h-4 w-4" />
          Add server
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: add ServerSelector dropdown"
```

---

## Phase 3: File Components

### Task 6: Create FileList Component

**Files:**
- Create: `src/components/files/FileList.tsx`
- Create: `src/components/files/FileCard.tsx`
- Create: `src/components/files/FileRow.tsx`
- Create: `src/components/files/FileTableRow.tsx`
- Create: `src/components/files/ViewToggle.tsx`

**Step 1: Create ViewToggle.tsx**

```tsx
import { Grid, List, Table2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type ViewMode = "grid" | "list" | "table"

interface ViewToggleProps {
  view: ViewMode
  onViewChange: (view: ViewMode) => void
}

export function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  return (
    <div className="flex border rounded-md">
      <Button
        variant="ghost"
        size="sm"
        className={cn("rounded-r-none", view === "grid" && "bg-accent")}
        onClick={() => onViewChange("grid")}
      >
        <Grid className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn("rounded-none border-x", view === "list" && "bg-accent")}
        onClick={() => onViewChange("list")}
      >
        <List className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn("rounded-l-none", view === "table" && "bg-accent")}
        onClick={() => onViewChange("table")}
      >
        <Table2 className="h-4 w-4" />
      </Button>
    </div>
  )
}
```

**Step 2: Create FileCard.tsx**

```tsx
import { FileBlob } from "@/types"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent } from "@/components/ui/card"
import { MimeTypeIcon } from "@/components/files/MimeTypeIcon"
import { formatFileSize, formatDate } from "@/lib/format"

interface FileCardProps {
  file: FileBlob
  selected: boolean
  onSelect: (selected: boolean) => void
  onClick: () => void
}

export function FileCard({ file, selected, onSelect, onClick }: FileCardProps) {
  const isImage = file.type.startsWith("image/")
  const isVideo = file.type.startsWith("video/")

  return (
    <Card
      className="group relative cursor-pointer hover:ring-2 hover:ring-ring"
      onClick={onClick}
    >
      <div
        className="absolute top-2 left-2 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={onSelect}
          className="bg-background"
        />
      </div>
      <CardContent className="p-0">
        <div className="aspect-square relative overflow-hidden rounded-t-lg bg-muted">
          {isImage || isVideo ? (
            <img
              src={file.thumbnail || file.url}
              alt={file.name}
              className="object-cover w-full h-full"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <MimeTypeIcon mimeType={file.type} className="h-16 w-16" />
            </div>
          )}
        </div>
        <div className="p-3">
          <p className="font-medium truncate text-sm">{file.name}</p>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(file.size)} · {formatDate(file.created)}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
```

**Step 3: Create FileRow.tsx**

```tsx
import { FileBlob } from "@/types"
import { Checkbox } from "@/components/ui/checkbox"
import { MimeTypeIcon } from "@/components/files/MimeTypeIcon"
import { formatFileSize, formatDate } from "@/lib/format"

interface FileRowProps {
  file: FileBlob
  selected: boolean
  onSelect: (selected: boolean) => void
  onClick: () => void
}

export function FileRow({ file, selected, onSelect, onClick }: FileRowProps) {
  return (
    <div
      className="flex items-center gap-3 p-3 hover:bg-accent rounded-lg cursor-pointer"
      onClick={onClick}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={selected} onCheckedChange={onSelect} />
      </div>
      <MimeTypeIcon mimeType={file.type} className="h-8 w-8 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{file.name}</p>
        <p className="text-sm text-muted-foreground">
          {formatFileSize(file.size)} · {formatDate(file.created)}
        </p>
      </div>
    </div>
  )
}
```

**Step 4: Create FileList.tsx**

```tsx
import { useState } from "react"
import { FileBlob } from "@/types"
import { FileCard } from "./FileCard"
import { FileRow } from "./FileRow"
import { ViewToggle, ViewMode } from "./ViewToggle"
import { FileFilters } from "./FileFilters"
import { FileActions } from "./FileActions"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { MimeTypeIcon } from "./MimeTypeIcon"
import { formatFileSize, formatDate } from "@/lib/format"

interface FileListProps {
  files: FileBlob[]
  onFileClick: (file: FileBlob) => void
  onDelete?: (files: FileBlob[]) => void
  onSync?: (files: FileBlob[]) => void
}

export function FileList({ files, onFileClick, onDelete, onSync }: FileListProps) {
  const [view, setView] = useState<ViewMode>("grid")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState({ search: "", type: "all", date: "all" })

  const filteredFiles = files.filter((file) => {
    if (filters.search && !file.name.toLowerCase().includes(filters.search.toLowerCase())) {
      return false
    }
    if (filters.type !== "all") {
      const typeMap: Record<string, string[]> = {
        images: ["image/"],
        videos: ["video/"],
        audio: ["audio/"],
        documents: ["application/pdf", "text/"],
      }
      const prefixes = typeMap[filters.type] || []
      if (!prefixes.some((p) => file.type.startsWith(p))) return false
    }
    return true
  })

  const toggleSelect = (id: string, isSelected: boolean) => {
    const next = new Set(selected)
    if (isSelected) next.add(id)
    else next.delete(id)
    setSelected(next)
  }

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelected(new Set(filteredFiles.map((f) => f.sha256)))
    } else {
      setSelected(new Set())
    }
  }

  const selectedFiles = filteredFiles.filter((f) => selected.has(f.sha256))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <FileFilters filters={filters} onFiltersChange={setFilters} />
        <ViewToggle view={view} onViewChange={setView} />
      </div>

      {selected.size > 0 && (
        <FileActions
          selectedCount={selected.size}
          onClear={() => setSelected(new Set())}
          onDelete={onDelete ? () => onDelete(selectedFiles) : undefined}
          onSync={onSync ? () => onSync(selectedFiles) : undefined}
        />
      )}

      {view === "grid" && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredFiles.map((file) => (
            <FileCard
              key={file.sha256}
              file={file}
              selected={selected.has(file.sha256)}
              onSelect={(s) => toggleSelect(file.sha256, s)}
              onClick={() => onFileClick(file)}
            />
          ))}
        </div>
      )}

      {view === "list" && (
        <div className="space-y-1">
          {filteredFiles.map((file) => (
            <FileRow
              key={file.sha256}
              file={file}
              selected={selected.has(file.sha256)}
              onSelect={(s) => toggleSelect(file.sha256, s)}
              onClick={() => onFileClick(file)}
            />
          ))}
        </div>
      )}

      {view === "table" && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selected.size === filteredFiles.length && filteredFiles.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredFiles.map((file) => (
              <TableRow
                key={file.sha256}
                className="cursor-pointer"
                onClick={() => onFileClick(file)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(file.sha256)}
                    onCheckedChange={(s) => toggleSelect(file.sha256, !!s)}
                  />
                </TableCell>
                <TableCell className="flex items-center gap-2">
                  <MimeTypeIcon mimeType={file.type} className="h-5 w-5" />
                  <span className="truncate max-w-[200px]">{file.name}</span>
                </TableCell>
                <TableCell className="text-muted-foreground">{file.type}</TableCell>
                <TableCell>{formatFileSize(file.size)}</TableCell>
                <TableCell>{formatDate(file.created)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {filteredFiles.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No files found
        </div>
      )}
    </div>
  )
}
```

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: add FileList with grid/list/table views and selection"
```

---

### Task 7: Create FileFilters and FileActions

**Files:**
- Create: `src/components/files/FileFilters.tsx`
- Create: `src/components/files/FileActions.tsx`

**Step 1: Create FileFilters.tsx**

```tsx
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Filters {
  search: string
  type: string
  date: string
}

interface FileFiltersProps {
  filters: Filters
  onFiltersChange: (filters: Filters) => void
}

export function FileFilters({ filters, onFiltersChange }: FileFiltersProps) {
  return (
    <div className="flex flex-1 items-center gap-2">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search files..."
          value={filters.search}
          onChange={(e) =>
            onFiltersChange({ ...filters, search: e.target.value })
          }
          className="pl-8"
        />
      </div>
      <Select
        value={filters.type}
        onValueChange={(type) => onFiltersChange({ ...filters, type })}
      >
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          <SelectItem value="images">Images</SelectItem>
          <SelectItem value="videos">Videos</SelectItem>
          <SelectItem value="audio">Audio</SelectItem>
          <SelectItem value="documents">Documents</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={filters.date}
        onValueChange={(date) => onFiltersChange({ ...filters, date })}
      >
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Date" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any time</SelectItem>
          <SelectItem value="today">Today</SelectItem>
          <SelectItem value="week">This week</SelectItem>
          <SelectItem value="month">This month</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
```

**Step 2: Create FileActions.tsx**

```tsx
import { X, Trash2, RefreshCw, Download } from "lucide-react"
import { Button } from "@/components/ui/button"

interface FileActionsProps {
  selectedCount: number
  onClear: () => void
  onDelete?: () => void
  onSync?: () => void
  onDownload?: () => void
}

export function FileActions({
  selectedCount,
  onClear,
  onDelete,
  onSync,
  onDownload,
}: FileActionsProps) {
  return (
    <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
      <span className="text-sm font-medium">{selectedCount} selected</span>
      <div className="flex-1" />
      {onDelete && (
        <Button variant="destructive" size="sm" onClick={onDelete}>
          <Trash2 className="h-4 w-4 mr-1" />
          Delete
        </Button>
      )}
      {onSync && (
        <Button variant="secondary" size="sm" onClick={onSync}>
          <RefreshCw className="h-4 w-4 mr-1" />
          Sync to...
        </Button>
      )}
      {onDownload && (
        <Button variant="secondary" size="sm" onClick={onDownload}>
          <Download className="h-4 w-4 mr-1" />
          Download
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={onClear}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add FileFilters and FileActions components"
```

---

### Task 8: Create MimeTypeIcon and Format Utils

**Files:**
- Create: `src/components/files/MimeTypeIcon.tsx`
- Create: `src/lib/format.ts`

**Step 1: Create MimeTypeIcon.tsx**

```tsx
import {
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  File,
  FileCode,
  FileArchive,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface MimeTypeIconProps {
  mimeType: string
  className?: string
}

export function MimeTypeIcon({ mimeType, className }: MimeTypeIconProps) {
  const iconClass = cn("text-muted-foreground", className)

  if (mimeType.startsWith("image/")) {
    return <FileImage className={iconClass} />
  }
  if (mimeType.startsWith("video/")) {
    return <FileVideo className={iconClass} />
  }
  if (mimeType.startsWith("audio/")) {
    return <FileAudio className={iconClass} />
  }
  if (mimeType.startsWith("text/") || mimeType === "application/pdf") {
    return <FileText className={iconClass} />
  }
  if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("rar")) {
    return <FileArchive className={iconClass} />
  }
  if (mimeType.includes("javascript") || mimeType.includes("json") || mimeType.includes("xml")) {
    return <FileCode className={iconClass} />
  }
  return <File className={iconClass} />
}
```

**Step 2: Create format.ts**

```typescript
import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"

dayjs.extend(relativeTime)

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
}

export function formatDate(timestamp: number): string {
  return dayjs(timestamp * 1000).fromNow()
}
```

**Step 3: Commit**

```bash
git add -A && git commit -m "feat: add MimeTypeIcon and format utilities"
```

---

## Phase 4: Upload Components

### Task 9: Create Upload Page Components

**Files:**
- Create: `src/components/upload/DropZone.tsx`
- Create: `src/components/upload/UploadSettings.tsx`
- Create: `src/components/upload/UploadQueue.tsx`

**Step 1: Create DropZone.tsx**

```tsx
import { useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { Upload } from "lucide-react"
import { cn } from "@/lib/utils"

interface DropZoneProps {
  onFilesAdded: (files: File[]) => void
}

export function DropZone({ onFilesAdded }: DropZoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      onFilesAdded(acceptedFiles)
    },
    [onFilesAdded]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop })

  return (
    <div
      {...getRootProps()}
      className={cn(
        "border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors",
        isDragActive
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25 hover:border-primary/50"
      )}
    >
      <input {...getInputProps()} />
      <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
      <p className="text-lg font-medium">
        {isDragActive ? "Drop files here" : "Drop files here or click to browse"}
      </p>
      <p className="text-sm text-muted-foreground mt-1">
        Upload images, videos, audio, documents
      </p>
    </div>
  )
}
```

**Step 2: Create UploadSettings.tsx**

```tsx
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { ChevronDown, Plus } from "lucide-react"
import { useState } from "react"

interface Server {
  url: string
  name: string
}

interface ImageOptions {
  resize: boolean
  maxWidth: number
  convert: boolean
  format: string
  stripMetadata: boolean
}

interface UploadSettingsProps {
  servers: Server[]
  selectedServers: Set<string>
  onServerToggle: (url: string) => void
  imageOptions: ImageOptions
  onImageOptionsChange: (options: ImageOptions) => void
}

export function UploadSettings({
  servers,
  selectedServers,
  onServerToggle,
  imageOptions,
  onImageOptionsChange,
}: UploadSettingsProps) {
  const [imageOptionsOpen, setImageOptionsOpen] = useState(false)

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium mb-2">Servers</h3>
        <div className="space-y-2">
          {servers.map((server) => (
            <label
              key={server.url}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Checkbox
                checked={selectedServers.has(server.url)}
                onCheckedChange={() => onServerToggle(server.url)}
              />
              <span className="text-sm">{server.name}</span>
            </label>
          ))}
          <Button variant="ghost" size="sm" className="mt-1">
            <Plus className="h-4 w-4 mr-1" />
            Add server
          </Button>
        </div>
      </div>

      <Collapsible open={imageOptionsOpen} onOpenChange={setImageOptionsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full justify-between">
            Image Options
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                imageOptionsOpen && "rotate-180"
              )}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={imageOptions.resize}
              onCheckedChange={(c) =>
                onImageOptionsChange({ ...imageOptions, resize: !!c })
              }
            />
            <span className="text-sm">Resize images</span>
            {imageOptions.resize && (
              <Select
                value={String(imageOptions.maxWidth)}
                onValueChange={(v) =>
                  onImageOptionsChange({ ...imageOptions, maxWidth: Number(v) })
                }
              >
                <SelectTrigger className="w-[120px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1920">1920px</SelectItem>
                  <SelectItem value="1280">1280px</SelectItem>
                  <SelectItem value="800">800px</SelectItem>
                </SelectContent>
              </Select>
            )}
          </label>

          <label className="flex items-center gap-2">
            <Checkbox
              checked={imageOptions.convert}
              onCheckedChange={(c) =>
                onImageOptionsChange({ ...imageOptions, convert: !!c })
              }
            />
            <span className="text-sm">Convert to</span>
            {imageOptions.convert && (
              <Select
                value={imageOptions.format}
                onValueChange={(format) =>
                  onImageOptionsChange({ ...imageOptions, format })
                }
              >
                <SelectTrigger className="w-[100px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="webp">WebP</SelectItem>
                  <SelectItem value="jpeg">JPEG</SelectItem>
                  <SelectItem value="png">PNG</SelectItem>
                </SelectContent>
              </Select>
            )}
          </label>

          <label className="flex items-center gap-2">
            <Checkbox
              checked={imageOptions.stripMetadata}
              onCheckedChange={(c) =>
                onImageOptionsChange({ ...imageOptions, stripMetadata: !!c })
              }
            />
            <span className="text-sm">Strip metadata</span>
          </label>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ")
}
```

**Step 3: Create UploadQueue.tsx**

```tsx
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { MimeTypeIcon } from "@/components/files/MimeTypeIcon"
import { formatFileSize } from "@/lib/format"

interface QueuedFile {
  id: string
  file: File
  progress: number
  status: "pending" | "uploading" | "done" | "error"
  transforms?: string[]
}

interface UploadQueueProps {
  files: QueuedFile[]
  onRemove: (id: string) => void
  onUploadAll: () => void
  onClear: () => void
}

export function UploadQueue({
  files,
  onRemove,
  onUploadAll,
  onClear,
}: UploadQueueProps) {
  if (files.length === 0) return null

  const isUploading = files.some((f) => f.status === "uploading")

  return (
    <div className="space-y-3">
      <h3 className="font-medium">Queued Files</h3>
      <div className="space-y-2">
        {files.map((qf) => (
          <div
            key={qf.id}
            className="flex items-center gap-3 p-3 border rounded-lg"
          >
            <MimeTypeIcon mimeType={qf.file.type} className="h-8 w-8 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{qf.file.name}</p>
              <p className="text-sm text-muted-foreground">
                {formatFileSize(qf.file.size)}
                {qf.transforms && qf.transforms.length > 0 && (
                  <span className="ml-2">· {qf.transforms.join(", ")}</span>
                )}
              </p>
              {qf.status === "uploading" && (
                <Progress value={qf.progress} className="mt-2 h-1" />
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRemove(qf.id)}
              disabled={qf.status === "uploading"}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button onClick={onUploadAll} disabled={isUploading}>
          {isUploading ? "Uploading..." : "Upload All"}
        </Button>
        <Button variant="outline" onClick={onClear} disabled={isUploading}>
          Clear
        </Button>
      </div>
    </div>
  )
}
```

**Step 4: Install react-dropzone**

```bash
npm install react-dropzone
```

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: add upload components (DropZone, Settings, Queue)"
```

---

## Phase 5: Page Rebuilds

### Task 10: Rebuild Layout Component

**Files:**
- Modify: `src/components/Layout/Layout.tsx`

**Step 1: Replace Layout.tsx**

```tsx
import { Outlet } from "react-router-dom"
import { TopNav } from "@/components/layout/TopNav"
import { Toaster } from "@/components/ui/toaster"
import { AudioPlayer } from "@/components/AudioPlayer"

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <TopNav />
      <main className="flex-1 container py-6">
        <Outlet />
      </main>
      <AudioPlayer />
      <Toaster />
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: rebuild Layout with TopNav and shadcn toaster"
```

---

### Task 11: Rebuild Browse (Home) Page

**Files:**
- Modify: `src/pages/Home.tsx`

**Step 1: Replace Home.tsx with new Browse page**

```tsx
import { useState } from "react"
import { FileList } from "@/components/files/FileList"
import { useBlobs } from "@/hooks/use-blobs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FileBlob } from "@/types"

export default function Browse() {
  const { blobs, deleteBlobs } = useBlobs()
  const [selectedFile, setSelectedFile] = useState<FileBlob | null>(null)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Browse Files</h1>
      <FileList
        files={blobs}
        onFileClick={setSelectedFile}
        onDelete={deleteBlobs}
      />

      <Dialog open={!!selectedFile} onOpenChange={() => setSelectedFile(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedFile?.name}</DialogTitle>
          </DialogHeader>
          {selectedFile && (
            <div className="space-y-4">
              {selectedFile.type.startsWith("image/") && (
                <img
                  src={selectedFile.url}
                  alt={selectedFile.name}
                  className="max-h-[60vh] mx-auto"
                />
              )}
              {/* Add video/audio/document preview as needed */}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: rebuild Browse page with FileList and dialog preview"
```

---

### Task 12: Rebuild Upload Page

**Files:**
- Modify: `src/pages/Upload.tsx`

**Step 1: Replace Upload.tsx**

```tsx
import { useState, useCallback } from "react"
import { DropZone } from "@/components/upload/DropZone"
import { UploadSettings } from "@/components/upload/UploadSettings"
import { UploadQueue } from "@/components/upload/UploadQueue"
import { useServers } from "@/hooks/use-servers"
import { useUpload } from "@/hooks/use-upload"

export default function Upload() {
  const { servers } = useServers()
  const { queuedFiles, addFiles, removeFile, clearQueue, uploadAll } = useUpload()

  const [selectedServers, setSelectedServers] = useState<Set<string>>(
    new Set(servers.slice(0, 1).map((s) => s.url))
  )
  const [imageOptions, setImageOptions] = useState({
    resize: false,
    maxWidth: 1920,
    convert: false,
    format: "webp",
    stripMetadata: false,
  })

  const handleServerToggle = (url: string) => {
    const next = new Set(selectedServers)
    if (next.has(url)) next.delete(url)
    else next.add(url)
    setSelectedServers(next)
  }

  const handleFilesAdded = useCallback(
    (files: File[]) => {
      addFiles(files, { servers: Array.from(selectedServers), imageOptions })
    },
    [addFiles, selectedServers, imageOptions]
  )

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Upload</h1>

      <DropZone onFilesAdded={handleFilesAdded} />

      <div className="grid md:grid-cols-2 gap-6">
        <UploadSettings
          servers={servers}
          selectedServers={selectedServers}
          onServerToggle={handleServerToggle}
          imageOptions={imageOptions}
          onImageOptionsChange={setImageOptions}
        />

        <UploadQueue
          files={queuedFiles}
          onRemove={removeFile}
          onUploadAll={uploadAll}
          onClear={clearQueue}
        />
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: rebuild Upload page with new components"
```

---

### Task 13: Rebuild Sync (Transfer) Page

**Files:**
- Modify: `src/pages/Transfer.tsx`

**Step 1: Replace Transfer.tsx**

```tsx
import { useState } from "react"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FileList } from "@/components/files/FileList"
import { useServers } from "@/hooks/use-servers"
import { useBlobs } from "@/hooks/use-blobs"

export default function Sync() {
  const { servers } = useServers()
  const [sourceServer, setSourceServer] = useState(servers[0]?.url || "")
  const [targetServer, setTargetServer] = useState("")
  const { blobs } = useBlobs(sourceServer)
  const [selectedFiles, setSelectedFiles] = useState<string[]>([])

  const handleSync = async () => {
    // Sync selected files from source to target
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Sync Files</h1>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Source:</span>
          <Select value={sourceServer} onValueChange={setSourceServer}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select server" />
            </SelectTrigger>
            <SelectContent>
              {servers.map((s) => (
                <SelectItem key={s.url} value={s.url}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <ArrowRight className="h-5 w-5 text-muted-foreground" />

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Target:</span>
          <Select value={targetServer} onValueChange={setTargetServer}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select server" />
            </SelectTrigger>
            <SelectContent>
              {servers
                .filter((s) => s.url !== sourceServer)
                .map((s) => (
                  <SelectItem key={s.url} value={s.url}>
                    {s.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleSync}
          disabled={!targetServer || selectedFiles.length === 0}
        >
          Sync Selected
        </Button>
      </div>

      <FileList
        files={blobs}
        onFileClick={() => {}}
        onSync={() => handleSync()}
      />
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: rebuild Sync page with source/target selection"
```

---

### Task 14: Rebuild Check Page

**Files:**
- Modify: `src/pages/Check.tsx`

**Step 1: Replace Check.tsx**

```tsx
import { useState } from "react"
import { CheckCircle, XCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useServers } from "@/hooks/use-servers"
import { useCheck } from "@/hooks/use-check"

export default function Check() {
  const { servers } = useServers()
  const [server, setServer] = useState(servers[0]?.url || "")
  const { results, isChecking, runCheck, recheckFailed } = useCheck(server)

  const failedCount = results.filter((r) => r.status === "missing").length

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Verify Blobs</h1>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Server:</span>
          <Select value={server} onValueChange={setServer}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select server" />
            </SelectTrigger>
            <SelectContent>
              {servers.map((s) => (
                <SelectItem key={s.url} value={s.url}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={runCheck} disabled={isChecking}>
          {isChecking ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Checking...
            </>
          ) : (
            "Run Check"
          )}
        </Button>

        {failedCount > 0 && (
          <Button variant="outline" onClick={recheckFailed}>
            Re-check Failed ({failedCount})
          </Button>
        )}
      </div>

      {results.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((result) => (
              <TableRow key={result.sha256}>
                <TableCell className="font-medium">{result.name}</TableCell>
                <TableCell>
                  {result.status === "ok" && (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      OK
                    </span>
                  )}
                  {result.status === "missing" && (
                    <span className="flex items-center gap-1 text-destructive">
                      <XCircle className="h-4 w-4" />
                      Missing
                    </span>
                  )}
                  {result.status === "checking" && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Checking...
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: rebuild Check page with verification status table"
```

---

## Phase 6: Cleanup

### Task 15: Remove DaisyUI and Old Components

**Files:**
- Modify: `package.json` (remove daisyui)
- Delete: `src/components/BottomNavBar/`
- Delete: `src/components/BlobList/`
- Delete: `src/components/ImageBlobList/`
- Delete: `src/components/VideoBlobList/`
- Delete: `src/components/AudioBlobList/`
- Delete: `src/components/DocumentBlobList/`
- Delete: `src/components/CheckBox/`
- Delete: `src/components/ProgressBar/`
- Delete: `src/components/ServerList/`
- Delete: `src/components/ServerListPopup/`
- Delete: old CSS files

**Step 1: Uninstall DaisyUI**

```bash
npm uninstall daisyui
```

**Step 2: Remove old component directories**

```bash
rm -rf src/components/BottomNavBar
rm -rf src/components/BlobList
rm -rf src/components/ImageBlobList
rm -rf src/components/VideoBlobList
rm -rf src/components/AudioBlobList
rm -rf src/components/DocumentBlobList
rm -rf src/components/CheckBox
rm -rf src/components/ProgressBar
rm -rf src/components/ServerList
rm -rf src/components/ServerListPopup
rm -f src/components/Layout/Layout.css
rm -f src/pages/Home.css
rm -f src/pages/Transfer.css
```

**Step 3: Commit**

```bash
git add -A && git commit -m "chore: remove DaisyUI and old components"
```

---

### Task 16: Update Routing and Verify Build

**Files:**
- Verify: `src/App.tsx` or router config

**Step 1: Ensure routes match new page names**

Check that routes are correct (Browse instead of Home if renamed).

**Step 2: Run build**

```bash
npm run build
```

Expected: Build succeeds with no errors

**Step 3: Run dev server and manual test**

```bash
npm run dev
```

Test: Navigate through all pages, verify responsive behavior, test theme toggle

**Step 4: Final commit**

```bash
git add -A && git commit -m "chore: finalize shadcn migration"
```

---

## Summary

16 tasks covering:
- Phase 1: Setup (Tasks 1-3)
- Phase 2: Layout (Tasks 4-5)
- Phase 3: File Components (Tasks 6-8)
- Phase 4: Upload Components (Task 9)
- Phase 5: Page Rebuilds (Tasks 10-14)
- Phase 6: Cleanup (Tasks 15-16)

Each task is a discrete unit with clear files, steps, and commits.
