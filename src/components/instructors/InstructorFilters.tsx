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

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suche nach Name..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={specializationFilter} onValueChange={onSpecializationChange}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="Spezialisierung" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="ski">Ski</SelectItem>
            <SelectItem value="snowboard">Snowboard</SelectItem>
            <SelectItem value="both">Beide</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={onStatusChange}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="active">Aktiv</SelectItem>
            <SelectItem value="inactive">Inaktiv</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={onSortChange}>
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Sortieren" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name-asc">Name A-Z</SelectItem>
            <SelectItem value="name-desc">Name Z-A</SelectItem>
            <SelectItem value="status">Status</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
