import { cn } from "@/lib/utils";
import type { Instructor } from "@/hooks/useInstructors";
import { Button } from "@/components/ui/button";

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
      textColor: "text-foreground",
      dotColor: "bg-green-500",
    },
    {
      key: "on_call",
      label: "Auf Abruf",
      count: onCallCount,
      textColor: "text-foreground",
      dotColor: "bg-orange-500",
    },
    {
      key: "unavailable",
      label: "Nicht verfügbar",
      count: unavailableCount,
      textColor: "text-foreground",
      dotColor: "bg-red-500",
    },
  ];

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2" aria-label="Verfügbarkeit filtern">
      {statuses.map((status) => (
        <Button
          key={status.key}
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onFilterClick(activeFilter === status.key ? null : status.key)
          }
          aria-pressed={activeFilter === status.key}
          className={cn(
            "control-target gap-2 font-normal",
            status.textColor,
            activeFilter === status.key && "border-foreground bg-muted"
          )}
        >
          <span className={cn("h-2 w-2 rounded-full", status.dotColor)} aria-hidden="true" />
          <span>{status.label}</span>
          <span className="font-semibold tabular-nums">{status.count}</span>
        </Button>
      ))}
      <div className="flex min-h-9 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground">
        <span>Total</span>
        <span className="font-semibold tabular-nums text-foreground">{instructors.length}</span>
      </div>
    </div>
  );
}
