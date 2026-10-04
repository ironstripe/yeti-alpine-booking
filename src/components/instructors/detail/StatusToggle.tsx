import { cn } from "@/lib/utils";

interface StatusToggleProps {
  currentStatus: string | null;
  onStatusChange: (status: string) => void;
  isPulsing: boolean;
  isUpdating: boolean;
  lastChanged?: string;
  compact?: boolean;
}

const statuses = [
  { value: "available", label: "Verfügbar", color: "bg-green-500", ring: "ring-green-500/30" },
  { value: "on_call", label: "Auf Abruf", color: "bg-orange-500", ring: "ring-orange-500/30" },
  { value: "unavailable", label: "Nicht verfügbar", color: "bg-red-500", ring: "ring-red-500/30" },
] as const;

export function StatusToggle({
  currentStatus,
  onStatusChange,
  isPulsing,
  isUpdating,
  lastChanged,
  compact = false,
}: StatusToggleProps) {
  const activeStatus = statuses.find((s) => s.value === currentStatus) || statuses[2];

  return (
    <div className={cn("flex items-center", compact ? "flex-row flex-wrap gap-2" : "flex-col gap-4")}>
      <div className={cn("flex items-center gap-2 bg-muted/50 rounded-full", compact ? "p-1" : "p-2")}>
        {statuses.map((status) => {
          const isActive = status.value === (currentStatus || "unavailable");
          return (
            <button
              key={status.value}
              onClick={() => onStatusChange(status.value)}
              disabled={isUpdating}
              className={cn(
                "rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                compact ? "icon-action" : "h-10 w-10",
                isActive
                  ? cn(status.color, compact ? "ring-2" : "ring-4", status.ring, isPulsing && "animate-status-pulse")
                  : "bg-transparent border-2 border-muted-foreground/30 hover:border-muted-foreground/50",
                isUpdating && "opacity-50 cursor-not-allowed"
              )}
              aria-label={status.label}
              title={status.label}
            />
          );
        })}
      </div>

      <div className={compact ? "text-left" : "text-center"}>
        <p className={cn("font-medium", compact ? "text-sm" : "text-lg")}>{activeStatus.label}</p>
        {lastChanged && (
          <p className="text-sm text-muted-foreground">
            Zuletzt geändert: {lastChanged}
          </p>
        )}
      </div>
    </div>
  );
}
