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
import { useAllSkillLevels } from '@/hooks/useSkillLevels';

interface TrainingsFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  skillFilter: string;
  onSkillFilterChange: (value: string) => void;
  disciplineFilter: string;
  onDisciplineFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
}

export function TrainingsFilters({
  search,
  onSearchChange,
  skillFilter,
  onSkillFilterChange,
  disciplineFilter,
  onDisciplineFilterChange,
  statusFilter,
  onStatusFilterChange,
}: TrainingsFiltersProps) {
  const { data: skillLevels = [] } = useAllSkillLevels();
  
  // Filter to only child levels for training courses
  const childSkillLevels = skillLevels.filter(level => level.target_group === 'child');

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

      {/* Skill level filter */}
      <Select value={skillFilter} onValueChange={onSkillFilterChange}>
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Niveau" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alle Niveaus</SelectItem>
          {childSkillLevels.map(level => (
            <SelectItem key={level.id} value={level.id}>
              {level.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Discipline filter */}
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
