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
