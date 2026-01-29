import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { supabase } from '@/integrations/supabase/client';
import type { Discipline, SkillColor } from '@/types/skill-levels';
import { getSkillColorClass, getSkillBadgeClass, isChild, ADULT_LEVEL_OPTIONS } from '@/types/skill-levels';

interface Participant {
  id: string;
  first_name: string;
  last_name: string | null;
  birth_date: string | null;
  current_ski_training_id?: string | null;
  current_snowboard_training_id?: string | null;
  self_assessed_ski_level?: string | null;
  self_assessed_snowboard_level?: string | null;
}

interface LevelOption {
  id: string;
  name: string;
  color: SkillColor | null;
  description: string | null;
  short_description: string | null;
}

interface LevelSelectorProps {
  participant: Participant;
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
  const isChildParticipant = isChild(participant.birth_date);

  // For children in group courses, fetch trainings (group_courses)
  // For adults or private lessons, use adult self-assessment levels
  const { data, isLoading } = useQuery({
    queryKey: ['level-options', discipline, isChildParticipant, isGroupCourse],
    queryFn: async (): Promise<{ 
      availableLevels: LevelOption[]; 
      suggestedLevel: LevelOption | null;
      fallbackLevel: LevelOption | null;
    }> => {
      if (isChildParticipant && isGroupCourse) {
        // Fetch trainings for children
        const { data: trainings, error } = await supabase
          .from('group_courses')
          .select('id, name, color, description')
          .eq('is_active', true)
          .or(`discipline.eq.${discipline},discipline.eq.both`)
          .order('sort_order', { ascending: true })
          .order('name');
        
        if (error) throw error;
        
        const levels = (trainings || []).map(t => ({
          id: t.id,
          name: t.name,
          color: (t.color?.includes('blue') ? 'blue' : 
                  t.color?.includes('red') ? 'red' : 
                  t.color?.includes('black') ? 'black' : 
                  t.color?.includes('green') ? 'green' : null) as SkillColor | null,
          description: t.description,
          short_description: null,
        }));

        // Get participant's current training for suggestion
        const currentTrainingId = discipline === 'ski' 
          ? participant.current_ski_training_id 
          : participant.current_snowboard_training_id;

        let suggestedLevel: LevelOption | null = null;
        let fallbackLevel: LevelOption | null = null;

        if (currentTrainingId) {
          // Find current training and check for next in progression
          const { data: currentTraining } = await supabase
            .from('group_courses')
            .select('id, name, color, next_training_id')
            .eq('id', currentTrainingId)
            .single();

          if (currentTraining?.next_training_id) {
            suggestedLevel = levels.find(l => l.id === currentTraining.next_training_id) || null;
            fallbackLevel = levels.find(l => l.id === currentTrainingId) || null;
          } else if (currentTraining) {
            suggestedLevel = levels.find(l => l.id === currentTrainingId) || null;
          }
        }

        return { availableLevels: levels, suggestedLevel, fallbackLevel };
      } else {
        // Adults: use static self-assessment levels
        const levels: LevelOption[] = ADULT_LEVEL_OPTIONS.map(opt => ({
          id: opt.value,
          name: opt.label,
          color: opt.value as SkillColor,
          description: opt.description,
          short_description: opt.description,
        }));

        const selfAssessed = discipline === 'ski' 
          ? participant.self_assessed_ski_level 
          : participant.self_assessed_snowboard_level;

        const suggestedLevel = selfAssessed 
          ? levels.find(l => l.id === selfAssessed) || levels[0]
          : levels[0];

        return { availableLevels: levels, suggestedLevel, fallbackLevel: null };
      }
    },
  });

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
