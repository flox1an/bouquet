import { BlobDescriptor } from "blossom-client-sdk"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent } from "@/components/ui/card"
import { MimeTypeIcon } from "@/components/files/MimeTypeIcon"
import { formatFileSize, formatDate } from "@/lib/format"

interface FileCardProps {
  file: BlobDescriptor
  selected: boolean
  onSelect: (selected: boolean) => void
  onClick: () => void
}

export function FileCard({ file, selected, onSelect, onClick }: FileCardProps) {
  const isImage = file.type?.startsWith("image/")
  const isVideo = file.type?.startsWith("video/")

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
              src={file.url}
              alt={file.sha256}
              className="object-cover w-full h-full"
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <MimeTypeIcon mimeType={file.type} className="h-16 w-16" />
            </div>
          )}
        </div>
        <div className="p-3">
          <p className="font-medium truncate text-sm">
            {file.sha256?.slice(0, 12)}...
          </p>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(file.size)} · {formatDate(file.uploaded)}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
