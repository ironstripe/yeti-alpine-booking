import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface RoleSelectorProps {
  value: string[];
  onChange: (roles: string[]) => void;
  error?: string;
  disabled?: boolean;
}

const AVAILABLE_ROLES = [
  { id: "ski", label: "Skilehrer", icon: "🎿" },
  { id: "snowboard", label: "Snowboardlehrer", icon: "🏂" },
  { id: "office", label: "Büro", icon: "💼" },
] as const;

export function RoleSelector({ value, onChange, error, disabled }: RoleSelectorProps) {
  const handleRoleChange = (roleId: string, checked: boolean) => {
    if (disabled) return;
    
    if (checked) {
      // Add role if not present
      if (!value.includes(roleId)) {
        onChange([...value, roleId]);
      }
    } else {
      // Remove role only if more than one remains
      if (value.length > 1) {
        onChange(value.filter((r) => r !== roleId));
      }
    }
  };

  return (
    <div className="space-y-2">
      <Label>
        Rollen <span className="text-destructive">*</span>
      </Label>
      <div className="flex flex-wrap gap-4">
        {AVAILABLE_ROLES.map((role) => {
          const isChecked = value.includes(role.id);
          const isLastRole = isChecked && value.length === 1;
          
          return (
            <label
              key={role.id}
              className={cn(
                "flex items-center gap-2 p-2 rounded-md border transition-colors cursor-pointer select-none",
                isChecked
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <Checkbox
                checked={isChecked}
                onCheckedChange={(checked) => handleRoleChange(role.id, checked === true)}
                disabled={disabled || isLastRole}
              />
              <span className="flex items-center gap-1.5 text-sm">
                <span>{role.icon}</span>
                <span>{role.label}</span>
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          ⚠️ {error}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Mindestens eine Rolle muss ausgewählt sein
      </p>
    </div>
  );
}

/**
 * Derive the display discipline from roles array (for backward compatibility)
 */
export function getDisciplineFromRoles(roles: string[]): string | null {
  const hasSki = roles.includes("ski");
  const hasSnowboard = roles.includes("snowboard");
  
  if (hasSki && hasSnowboard) return "both";
  if (hasSnowboard) return "snowboard";
  if (hasSki) return "ski";
  return null; // Office only
}

/**
 * Check if instructor has any teaching role
 */
export function hasTeachingRole(roles: string[]): boolean {
  return roles.includes("ski") || roles.includes("snowboard");
}

/**
 * Get roles array from specialization (for migration/fallback)
 */
export function getRolesFromSpecialization(specialization: string | null): string[] {
  if (!specialization) return ["ski"];
  if (specialization === "both") return ["ski", "snowboard"];
  return [specialization];
}
