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
  const toggleRole = (roleId: string) => {
    if (disabled) return;
    
    if (value.includes(roleId)) {
      // Don't allow removing last role
      if (value.length > 1) {
        onChange(value.filter((r) => r !== roleId));
      }
    } else {
      onChange([...value, roleId]);
    }
  };

  return (
    <div className="space-y-2">
      <Label>
        Rollen <span className="text-destructive">*</span>
      </Label>
      <div className="flex flex-wrap gap-4">
        {AVAILABLE_ROLES.map((role) => (
          <div
            key={role.id}
            className={cn(
              "flex items-center gap-2 p-2 rounded-md border transition-colors cursor-pointer",
              value.includes(role.id)
                ? "border-primary bg-primary/5"
                : "border-border hover:bg-muted/50",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            onClick={() => toggleRole(role.id)}
          >
            <Checkbox
              checked={value.includes(role.id)}
              onCheckedChange={() => toggleRole(role.id)}
              disabled={disabled || (value.includes(role.id) && value.length === 1)}
            />
            <span className="flex items-center gap-1.5 text-sm">
              <span>{role.icon}</span>
              <span>{role.label}</span>
            </span>
          </div>
        ))}
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
