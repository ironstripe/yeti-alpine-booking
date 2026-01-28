import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSkillLevels } from "@/hooks/useSkillLevels";
import { cn } from "@/lib/utils";
import type { Discipline, TargetGroup } from "@/types/skill-levels";

interface SkillLevelSelectProps {
  discipline: Discipline;
  targetGroup: TargetGroup;
  value: string | null;
  onChange: (levelId: string) => void;
  disabled?: boolean;
}

export function SkillLevelSelect({
  discipline,
  targetGroup,
  value,
  onChange,
  disabled = false,
}: SkillLevelSelectProps) {
  const { data: levels, isLoading } = useSkillLevels(discipline, targetGroup);

  if (isLoading) {
    return (
      <Select disabled>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Laden..." />
        </SelectTrigger>
      </Select>
    );
  }

  return (
    <Select
      value={value || ""}
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Level wählen..." />
      </SelectTrigger>
      <SelectContent>
        {(levels || []).map((level) => (
          <SelectItem key={level.id} value={level.id}>
            <div className="flex items-center gap-2">
              {level.color && (
                <div
                  className={cn(
                    "w-3 h-3 rounded-full flex-shrink-0",
                    level.color === "green" && "bg-green-500",
                    level.color === "blue" && "bg-blue-500",
                    level.color === "red" && "bg-red-500",
                    level.color === "black" && "bg-gray-900"
                  )}
                />
              )}
              <span>{level.name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
