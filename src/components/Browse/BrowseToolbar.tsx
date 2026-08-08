import { ArrowDownAZ, ArrowUpAZ, LayoutGrid, List, Search, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ServerInfo } from '../../utils/useServerInfo';
import type { TimelineSort, TimelineSortField } from '../../catalog/advanced';
import { formatFileSize } from '../../utils/utils';
import { SORT_FIELD_OPTIONS, TYPE_FILTERS, type TypeFilter } from './browseConstants';
import { BrowseFilterMenu, type AvailabilityFilter } from './BrowseFilterMenu';

export type BrowseDisplayMode = 'media' | 'list';

type BrowseToolbarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  displayMode: BrowseDisplayMode;
  onDisplayModeChange: (mode: BrowseDisplayMode) => void;
  typeFilter: TypeFilter;
  onTypeFilterChange: (value: TypeFilter) => void;
  sort: TimelineSort;
  onSortChange: (value: TimelineSort) => void;
  servers: ServerInfo[];
  selectedServerName?: string;
  onServerChange: (name: string | undefined) => void;
  onManageServers: () => void;
  eventOnly: boolean;
  onEventOnlyChange: (value: boolean) => void;
  descriptiveOnly: boolean;
  onDescriptiveOnlyChange: (value: boolean) => void;
  availabilityFilter: AvailabilityFilter[];
  onAvailabilityFilterChange: (value: AvailabilityFilter[]) => void;
  matchingCount: number;
};

export function BrowseToolbar({
  search,
  onSearchChange,
  displayMode,
  onDisplayModeChange,
  typeFilter,
  onTypeFilterChange,
  sort,
  onSortChange,
  servers,
  selectedServerName,
  onServerChange,
  onManageServers,
  eventOnly,
  onEventOnlyChange,
  descriptiveOnly,
  onDescriptiveOnlyChange,
  availabilityFilter,
  onAvailabilityFilterChange,
  matchingCount,
}: BrowseToolbarProps) {
  const realServers = servers.filter(server => !server.virtual);

  return (
    <section className="mb-6 border bg-card p-4 shadow-[3px_3px_0_hsl(var(--border))]" aria-label="Browse toolbar">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <label className="relative block min-w-0 flex-1 basis-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={event => onSearchChange(event.target.value)}
            placeholder="Search titles, descriptions, event metadata, or a file hash"
            className="pl-9"
            aria-label="Search your media"
          />
        </label>

        <div className="inline-flex shrink-0 rounded-md border bg-background p-0.5" aria-label="Browse display mode">
          <Button
            size="sm"
            variant={displayMode === 'media' ? 'default' : 'ghost'}
            onClick={() => onDisplayModeChange('media')}
            aria-pressed={displayMode === 'media'}
          >
            <LayoutGrid className="h-4 w-4" />
            Media
          </Button>
          <Button
            size="sm"
            variant={displayMode === 'list' ? 'default' : 'ghost'}
            onClick={() => onDisplayModeChange('list')}
            aria-pressed={displayMode === 'list'}
          >
            <List className="h-4 w-4" />
            List
          </Button>
        </div>

        <Select value={typeFilter} onValueChange={value => onTypeFilterChange(value as TypeFilter)}>
          <SelectTrigger className="w-40 shrink-0" aria-label="Media type filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPE_FILTERS.map(filter => (
              <SelectItem key={filter.id} value={filter.id}>
                {filter.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {displayMode === 'list' && (
          <div className="flex shrink-0 items-center gap-1">
            <Select
              value={sort.field}
              onValueChange={value => onSortChange({ ...sort, field: value as TimelineSortField })}
            >
              <SelectTrigger className="w-36" aria-label="Sort by">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_FIELD_OPTIONS.map(option => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              aria-label={sort.direction === 'asc' ? 'Sort ascending' : 'Sort descending'}
              onClick={() => onSortChange({ ...sort, direction: sort.direction === 'asc' ? 'desc' : 'asc' })}
            >
              {sort.direction === 'asc' ? <ArrowUpAZ className="h-4 w-4" /> : <ArrowDownAZ className="h-4 w-4" />}
            </Button>
          </div>
        )}

        <Select
          value={selectedServerName ?? '__all__'}
          onValueChange={value => onServerChange(value === '__all__' ? undefined : value)}
        >
          <SelectTrigger className="w-48 shrink-0" aria-label="Filter by server">
            <SelectValue placeholder="Any server" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Any server</SelectItem>
            {realServers.map(server => (
              <SelectItem key={server.name} value={server.name}>
                {server.name} · {formatFileSize(server.size)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={onManageServers} className="shrink-0">
          <Settings className="h-4 w-4" />
          Manage servers
        </Button>

        <div className="shrink-0">
          <BrowseFilterMenu
            eventOnly={eventOnly}
            onEventOnlyChange={onEventOnlyChange}
            descriptiveOnly={descriptiveOnly}
            onDescriptiveOnlyChange={onDescriptiveOnlyChange}
            availabilityFilter={availabilityFilter}
            onAvailabilityFilterChange={onAvailabilityFilterChange}
          />
        </div>
      </div>
      <p className="mt-3 font-mono text-xs text-muted-foreground">
        {matchingCount.toLocaleString()} matching item{matchingCount === 1 ? '' : 's'}
      </p>
    </section>
  );
}
