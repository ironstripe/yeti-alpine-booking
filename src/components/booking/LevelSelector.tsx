import React, { useEffect } from 'react';
import { useBookingLevels } from '@/hooks/useSkillLevels';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Info, Sparkles } from 'lucide-react';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipTrigger 
} from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { Discipline, ParticipantWithLevels, SkillColor } from '@/types/skill-levels';
import { getSkillColorClass, getSkillBadgeClass } from '@/types/skill-levels';

interface LevelSelectorProps {
  participant: ParticipantWithLevels;
  discipline: Discipline;
  isGroupCourse: boolean;
  value: string | null;
  onChange: (levelId: string) => void;
  disabled?: boolean;
  className?: string;
}

export function LevelSelector({
  participant,
  discipline,
  isGroupCourse,
  value,
  onChange,
  disabled = false,
  className,
}: LevelSelectorProps) {
  const { data, isLoading } = useBookingLevels(participant, discipline, isGroupCourse);

  const { availableLevels, suggestedLevel, fallbackLevel } = data || {};

  // Auto-select suggested level if no value is set
  useEffect(() => {
    if (!value && suggestedLevel && !disabled) {
      onChange(suggestedLevel.id);
    }
  }, [value, suggestedLevel, onChange, disabled]);

  if (isLoading) {
    return <Skeleton className="h-10 w-full" />;
  }

  if (!availableLevels?.length) {
    return (
      <div className="text-sm text-muted-foreground">
        Keine Level verfügbar
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Suggestion Banner */}
      {suggestedLevel && (
        <div className="flex items-center gap-2 text-sm bg-primary/10 text-primary px-3 py-2 rounded-md">
          <Sparkles className="h-4 w-4 flex-shrink-0" />
          <span>
            Vorschlag: <strong>{suggestedLevel.name}</strong>
          </span>
          {fallbackLevel && (
            <span className="text-muted-foreground">
              (Alternativ: {fallbackLevel.name})
            </span>
          )}
        </div>
      )}

      {/* Level Dropdown */}
      <Select 
        value={value || undefined} 
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="Level auswählen..." />
        </SelectTrigger>
        <SelectContent>
          {availableLevels.map((level) => (
            <SelectItem key={level.id} value={level.id}>
              <div className="flex items-center gap-2">
                {level.color && (
                  <div 
                    className={cn(
                      "w-3 h-3 rounded-full flex-shrink-0",
                      getSkillColorClass(level.color as SkillColor)
                    )} 
                  />
                )}
                <span>{level.name}</span>
                {level.id === suggestedLevel?.id && (
                  <Badge variant="secondary" className="text-xs ml-1">
                    Empfohlen
                  </Badge>
                )}
                {level.short_description && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground ml-auto flex-shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      <p className="text-sm">{level.short_description}</p>
                      {level.description && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {level.description}
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Compact level badge display (for tables and cards)
 */
export function LevelBadge({ 
  levelId, 
  levelName, 
  color,
  className 
}: { 
  levelId?: string | null;
  levelName?: string;
  color?: SkillColor | null;
  className?: string;
}) {
  if (!levelId && !levelName) {
    return (
      <Badge variant="outline" className={cn("text-muted-foreground", className)}>
        Nicht angegeben
      </Badge>
    );
  }

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "border",
        color ? getSkillBadgeClass(color) : "",
        className
      )}
    >
      {color && (
        <span 
          className={cn(
            "w-2 h-2 rounded-full mr-1.5",
            getSkillColorClass(color)
          )} 
        />
      )}
      {levelName || levelId}
    </Badge>
  );
}
