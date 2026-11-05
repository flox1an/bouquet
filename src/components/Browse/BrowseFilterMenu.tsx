import { Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TimelineProjection } from '../../catalog/catalog';
import type { ServerInfo } from '../../utils/useServerInfo';
import { formatFileSize } from '../../utils/utils';
import { AVAILABILITY_LABEL } from './browseConstants';

export type AvailabilityFilter = TimelineProjection['availabilityState'];

const AVAILABILITY_OPTIONS = Object.entries(AVAILABILITY_LABEL) as Array<[AvailabilityFilter, string]>;

const ANY_SERVER = '__all__';

type BrowseFilterMenuProps = {
  servers: ServerInfo[];
  selectedServerName?: string;
  onServerChange: (name: string | undefined) => void;
  eventOnly: boolean;
  onEventOnlyChange: (value: boolean) => void;
  unlinkedOnly: boolean;
  onUnlinkedOnlyChange: (value: boolean) => void;
  groupRepeated: boolean;
  onGroupRepeatedChange: (value: boolean) => void;
  descriptiveOnly: boolean;
  onDescriptiveOnlyChange: (value: boolean) => void;
  availabilityFilter: AvailabilityFilter[];
  onAvailabilityFilterChange: (value: AvailabilityFilter[]) => void;
};

export function BrowseFilterMenu({
  servers,
  selectedServerName,
  onServerChange,
  eventOnly,
  onEventOnlyChange,
  unlinkedOnly,
  onUnlinkedOnlyChange,
  groupRepeated,
  onGroupRepeatedChange,
  descriptiveOnly,
  onDescriptiveOnlyChange,
  availabilityFilter,
  onAvailabilityFilterChange,
}: BrowseFilterMenuProps) {
  // "Has post" and "No post" exclude each other, so they are one radio choice
  // driving both flags: the menu can never ask for both at once.
  const postFilter = eventOnly ? 'linked' : unlinkedOnly ? 'unlinked' : 'all';
  const setPostFilter = (value: string) => {
    onEventOnlyChange(value === 'linked');
    onUnlinkedOnlyChange(value === 'unlinked');
  };

  // Grouping is a view option, not a filter, so it does not count here.
  const activeCount =
    (postFilter === 'all' ? 0 : 1) +
    (descriptiveOnly ? 1 : 0) +
    (selectedServerName ? 1 : 0) +
    availabilityFilter.length;

  const toggleAvailability = (id: AvailabilityFilter) => {
    onAvailabilityFilterChange(
      availabilityFilter.includes(id) ? availabilityFilter.filter(item => item !== id) : [...availabilityFilter, id]
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Filter className="h-4 w-4" aria-hidden="true" />
          Filters
          {activeCount > 0 && (
            <span className="ml-1 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">
              {activeCount}
              <span className="sr-only"> active</span>
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[70vh] w-64 overflow-y-auto">
        <DropdownMenuLabel>Posts</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={postFilter} onValueChange={setPostFilter}>
          <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="linked">Has post</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="unlinked">No post</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuCheckboxItem checked={descriptiveOnly} onCheckedChange={onDescriptiveOnlyChange}>
          Only descriptive titles
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Availability</DropdownMenuLabel>
        {AVAILABILITY_OPTIONS.map(([id, label]) => (
          <DropdownMenuCheckboxItem
            key={id}
            checked={availabilityFilter.includes(id)}
            onCheckedChange={() => toggleAvailability(id)}
          >
            {label}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Server</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={selectedServerName ?? ANY_SERVER}
          onValueChange={value => onServerChange(value === ANY_SERVER ? undefined : value)}
        >
          <DropdownMenuRadioItem value={ANY_SERVER}>Any server</DropdownMenuRadioItem>
          {servers.map(server => (
            <DropdownMenuRadioItem key={server.name} value={server.name}>
              <span className="truncate">{server.name}</span>
              <span className="ml-auto pl-2 text-xs text-muted-foreground">{formatFileSize(server.size)}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>View</DropdownMenuLabel>
        <DropdownMenuCheckboxItem checked={groupRepeated} onCheckedChange={onGroupRepeatedChange}>
          Group repeated posts
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
