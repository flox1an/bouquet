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
