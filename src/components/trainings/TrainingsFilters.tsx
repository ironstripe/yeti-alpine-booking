import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search } from 'lucide-react';
import { DISCIPLINES } from '@/types/group-courses';

interface TrainingsFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  disciplineFilter: string;
  onDisciplineFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  showDisciplineFilter?: boolean;
}

export function TrainingsFilters({
  search,
  onSearchChange,
  disciplineFilter,
  onDisciplineFilterChange,
  statusFilter,
  onStatusFilterChange,
  showDisciplineFilter = true,
}: TrainingsFiltersProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3 mb-6">
      {/* Search */}
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Training suchen..."
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Discipline filter - only show for courses */}
      {showDisciplineFilter && (
        <Select value={disciplineFilter} onValueChange={onDisciplineFilterChange}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Disziplin" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Disziplinen</SelectItem>
            {DISCIPLINES.map(disc => (
              <SelectItem key={disc.value} value={disc.value}>
                {disc.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Status filter */}
      <Select value={statusFilter} onValueChange={onStatusFilterChange}>
        <SelectTrigger className="w-32">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle</SelectItem>
          <SelectItem value="active">Aktiv</SelectItem>
          <SelectItem value="inactive">Inaktiv</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
