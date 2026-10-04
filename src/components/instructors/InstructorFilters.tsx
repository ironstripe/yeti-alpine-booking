import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Search } from "lucide-react";

interface InstructorFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  specializationFilter: string;
  onSpecializationChange: (value: string) => void;
  statusFilter: string;
  onStatusChange: (value: string) => void;
  sortBy: string;
  onSortChange: (value: string) => void;
  showOnlyAvailable: boolean;
  onShowOnlyAvailableChange: (value: boolean) => void;
}

export function InstructorFilters({
  searchQuery,
  onSearchChange,
  specializationFilter,
  onSpecializationChange,
  statusFilter,
  onStatusChange,
  sortBy,
  onSortChange,
  showOnlyAvailable,
  onShowOnlyAvailableChange,
}: InstructorFiltersProps) {
  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center gap-3">
        <Checkbox
          id="only-available"
          checked={showOnlyAvailable}
          onCheckedChange={(checked) =>
            onShowOnlyAvailableChange(checked === true)
          }
        />
        <Label
          htmlFor="only-available"
          className="text-sm font-medium cursor-pointer"
        >
          Nur verfügbare anzeigen
        </Label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(16rem,1fr)_11rem_11rem_11rem]">
        <div className="relative flex-1">
          <Label htmlFor="instructor-search" className="mb-1.5 block text-sm font-medium">
            Suche
          </Label>
          <Search className="absolute bottom-3 left-3 h-4 w-4 text-muted-foreground" />
          <Input
            id="instructor-search"
            placeholder="Suche nach Name..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="control-target pl-9"
          />
        </div>

        <div>
          <Label htmlFor="instructor-sport" className="mb-1.5 block text-sm font-medium">Sportart</Label>
          <Select value={specializationFilter} onValueChange={onSpecializationChange}>
            <SelectTrigger id="instructor-sport" className="control-target w-full">
              <SelectValue placeholder="Sportart" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="ski">Ski</SelectItem>
              <SelectItem value="snowboard">Snowboard</SelectItem>
              <SelectItem value="both">Beide</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="instructor-employment-status" className="mb-1.5 block text-sm font-medium">Anstellungsstatus</Label>
          <Select value={statusFilter} onValueChange={onStatusChange}>
            <SelectTrigger id="instructor-employment-status" className="control-target w-full">
              <SelectValue placeholder="Anstellungsstatus" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="active">Aktiv</SelectItem>
              <SelectItem value="inactive">Inaktiv</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="instructor-sort" className="mb-1.5 block text-sm font-medium">Sortierung</Label>
          <Select value={sortBy} onValueChange={onSortChange}>
            <SelectTrigger id="instructor-sort" className="control-target w-full">
              <SelectValue placeholder="Sortierung" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name-asc">Name A-Z</SelectItem>
              <SelectItem value="name-desc">Name Z-A</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
