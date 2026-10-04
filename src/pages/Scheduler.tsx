import { SchedulerGrid } from "@/components/scheduler/SchedulerGrid";

export default function Scheduler() {
  return (
    <div className="flex flex-col h-full min-h-0 min-w-0 bg-background">
      <header className="shrink-0 px-3 py-2 md:px-4">
        <h1 className="font-display text-xl font-bold text-foreground">Stundenplan</h1>
      </header>
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        <SchedulerGrid />
      </div>
    </div>
  );
}
