import { useState } from "react"
import { BlobDescriptor } from "blossom-client-sdk"
import { FileCard } from "./FileCard"
import { FileRow } from "./FileRow"
import { ViewToggle, ViewMode } from "./ViewToggle"
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
  files: BlobDescriptor[]
  onFileClick: (file: BlobDescriptor) => void
  onDelete?: (files: BlobDescriptor[]) => void
  onSync?: (files: BlobDescriptor[]) => void
}

export function FileList({ files, onFileClick, onDelete, onSync }: FileListProps) {
  const [view, setView] = useState<ViewMode>("grid")
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggleSelect = (id: string, isSelected: boolean) => {
    const next = new Set(selected)
    if (isSelected) next.add(id)
    else next.delete(id)
    setSelected(next)
  }

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelected(new Set(files.map((f) => f.sha256)))
    } else {
      setSelected(new Set())
    }
  }

  const selectedFiles = files.filter((f) => selected.has(f.sha256))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-muted-foreground">
          {files.length} files
          {selected.size > 0 && ` · ${selected.size} selected`}
        </div>
        <ViewToggle view={view} onViewChange={setView} />
      </div>

      {view === "grid" && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {files.map((file) => (
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
          {files.map((file) => (
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
                  checked={selected.size === files.length && files.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>Hash</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map((file) => (
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
                  <span className="truncate max-w-[200px]">
                    {file.sha256?.slice(0, 16)}...
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">{file.type}</TableCell>
                <TableCell>{formatFileSize(file.size)}</TableCell>
                <TableCell>{formatDate(file.uploaded)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {files.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No files found
        </div>
      )}
    </div>
  )
}
