import { BlobDescriptor } from "blossom-client-sdk"
import { Checkbox } from "@/components/ui/checkbox"
import { MimeTypeIcon } from "@/components/files/MimeTypeIcon"
import { formatFileSize, formatDate } from "@/lib/format"

interface FileRowProps {
  file: BlobDescriptor
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
        <p className="font-medium truncate">{file.sha256?.slice(0, 16)}...</p>
        <p className="text-sm text-muted-foreground">
          {formatFileSize(file.size)} · {formatDate(file.uploaded)}
        </p>
      </div>
    </div>
  )
}
