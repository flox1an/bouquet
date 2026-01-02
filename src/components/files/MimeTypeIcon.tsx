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
  mimeType: string | undefined
  className?: string
}

export function MimeTypeIcon({ mimeType, className }: MimeTypeIconProps) {
  const iconClass = cn("text-muted-foreground", className)

  if (!mimeType) {
    return <File className={iconClass} />
  }
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
