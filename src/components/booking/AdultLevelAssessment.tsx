import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { AdultSelfAssessment, Discipline } from '@/types/skill-levels';
import { ADULT_LEVEL_OPTIONS, getSkillColorClass } from '@/types/skill-levels';

interface AdultLevelAssessmentProps {
  value: AdultSelfAssessment | null;
  onChange: (level: AdultSelfAssessment) => void;
  discipline: Discipline;
  disabled?: boolean;
  className?: string;
}

export function AdultLevelAssessment({ 
  value, 
  onChange, 
  discipline,
  disabled = false,
  className 
}: AdultLevelAssessmentProps) {
  return (
    <div className={cn("space-y-3", className)}>
      <Label className="text-sm font-medium">
        Selbsteinschätzung {discipline === 'ski' ? 'Ski' : 'Snowboard'}
      </Label>
      
      <RadioGroup 
        value={value || undefined} 
        onValueChange={(v) => onChange(v as AdultSelfAssessment)}
        disabled={disabled}
        className="grid grid-cols-1 sm:grid-cols-2 gap-3"
      >
        {ADULT_LEVEL_OPTIONS.map((level) => (
          <Label
            key={level.value}
            htmlFor={`level-${level.value}`}
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
              "hover:bg-accent/50",
              value === level.value 
                ? "border-primary bg-primary/5" 
                : "border-border",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <RadioGroupItem 
              value={level.value} 
              id={`level-${level.value}`} 
              className="mt-0.5"
            />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span 
                  className={cn(
                    "w-3 h-3 rounded-full",
                    getSkillColorClass(level.value)
                  )}
                />
                <span className="font-medium text-sm">{level.label}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {level.description}
              </p>
            </div>
          </Label>
        ))}
      </RadioGroup>
      
      <p className="text-xs text-muted-foreground">
        Die Farben entsprechen der Pistenfarbe, die Sie sicher befahren können.
      </p>
    </div>
  );
}

/**
 * Inline compact version for forms
 */
export function AdultLevelSelect({
  value,
  onChange,
  discipline,
  disabled = false,
  className,
}: AdultLevelAssessmentProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-sm font-medium">
        Können ({discipline === 'ski' ? 'Ski' : 'Snowboard'})
      </Label>
      
      <div className="flex flex-wrap gap-2">
        {ADULT_LEVEL_OPTIONS.map((level) => (
          <button
            key={level.value}
            type="button"
            onClick={() => !disabled && onChange(level.value)}
            disabled={disabled}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors",
              value === level.value 
                ? "border-primary bg-primary text-primary-foreground" 
                : "border-border hover:border-primary/50 hover:bg-accent",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <span 
              className={cn(
                "w-2.5 h-2.5 rounded-full",
                value === level.value 
                  ? "bg-primary-foreground" 
                  : getSkillColorClass(level.value)
              )}
            />
            {level.label}
          </button>
        ))}
      </div>
    </div>
  );
}
