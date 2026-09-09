import { Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TimelineProjection } from '../../catalog/catalog';

export type AvailabilityFilter = TimelineProjection['availabilityState'];

const AVAILABILITY_OPTIONS: Array<{ id: AvailabilityFilter; label: string }> = [
  { id: 'complete', label: 'Complete' },
  { id: 'partial', label: 'Partial' },
  { id: 'unavailable', label: 'Unavailable' },
  { id: 'unknown', label: 'Not checked' },
];

type BrowseFilterMenuProps = {
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
  const activeCount =
    (eventOnly ? 1 : 0) + (unlinkedOnly ? 1 : 0) + (descriptiveOnly ? 1 : 0) + availabilityFilter.length;

  const toggleAvailability = (id: AvailabilityFilter) => {
    onAvailabilityFilterChange(
      availabilityFilter.includes(id) ? availabilityFilter.filter(item => item !== id) : [...availabilityFilter, id]
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label="More filters">
          <Filter className="h-4 w-4" />
          Filters
          {activeCount > 0 && (
            <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Visibility</DropdownMenuLabel>
        <DropdownMenuCheckboxItem checked={eventOnly} onCheckedChange={onEventOnlyChange}>
          Only media with a Nostr event
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={unlinkedOnly} onCheckedChange={onUnlinkedOnlyChange}>
          Only unlinked content (no Nostr event)
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={groupRepeated} onCheckedChange={onGroupRepeatedChange}>
          Group repeated posts of the same file
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={descriptiveOnly} onCheckedChange={onDescriptiveOnlyChange}>
          Only descriptive titles
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Availability</DropdownMenuLabel>
        {AVAILABILITY_OPTIONS.map(option => (
          <DropdownMenuCheckboxItem
            key={option.id}
            checked={availabilityFilter.includes(option.id)}
            onCheckedChange={() => toggleAvailability(option.id)}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
