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

export type { Filters }
