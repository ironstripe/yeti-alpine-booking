import { PageHeader } from "@/components/layout/PageHeader";
import { SchedulerGrid } from "@/components/scheduler/SchedulerGrid";

export default function Scheduler() {
  return (
    <div className="flex flex-col h-full min-h-0 min-w-0 bg-background">
      <div className="shrink-0 p-4 md:p-6">
        <PageHeader
          title="Stundenplan"
          description="Übersicht aller Lehrer und Buchungen"
        />
      </div>
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
        <SchedulerGrid />
      </div>
    </div>
  );
}
