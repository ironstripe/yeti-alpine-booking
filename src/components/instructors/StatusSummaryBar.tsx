import { cn } from "@/lib/utils";
import type { Instructor } from "@/hooks/useInstructors";

interface StatusSummaryBarProps {
  instructors: Instructor[];
  activeFilter: string | null;
  onFilterClick: (status: string | null) => void;
}

export function StatusSummaryBar({
  instructors,
  activeFilter,
  onFilterClick,
}: StatusSummaryBarProps) {
  const availableCount = instructors.filter(
    (i) => i.real_time_status === "available"
  ).length;
  const onCallCount = instructors.filter(
    (i) => i.real_time_status === "on_call"
  ).length;
  const unavailableCount = instructors.filter(
    (i) => i.real_time_status === "unavailable" || !i.real_time_status
  ).length;

  const statuses = [
    {
      key: "available",
      label: "Verfügbar",
      count: availableCount,
      bgColor: "bg-green-100 hover:bg-green-200",
      textColor: "text-green-800",
      dotColor: "bg-green-500",
      activeRing: "ring-green-500",
    },
    {
      key: "on_call",
      label: "Auf Abruf",
      count: onCallCount,
      bgColor: "bg-orange-100 hover:bg-orange-200",
      textColor: "text-orange-800",
      dotColor: "bg-orange-500",
      activeRing: "ring-orange-500",
    },
    {
      key: "unavailable",
      label: "Nicht verfügbar",
      count: unavailableCount,
      bgColor: "bg-red-100 hover:bg-red-200",
      textColor: "text-red-800",
      dotColor: "bg-red-500",
      activeRing: "ring-red-500",
    },
  ];

  return (
    <div className="flex flex-wrap gap-3 mb-6">
      {statuses.map((status) => (
        <button
          key={status.key}
          onClick={() =>
            onFilterClick(activeFilter === status.key ? null : status.key)
          }
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg transition-all",
            status.bgColor,
            status.textColor,
            activeFilter === status.key && `ring-2 ${status.activeRing}`
          )}
        >
          <span className={cn("w-3 h-3 rounded-full", status.dotColor)} />
          <span className="font-medium">{status.label}:</span>
          <span className="font-bold">{status.count}</span>
        </button>
      ))}
      <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted text-muted-foreground">
        <span className="font-medium">Total:</span>
        <span className="font-bold">{instructors.length} Skilehrer</span>
      </div>
    </div>
  );
}
