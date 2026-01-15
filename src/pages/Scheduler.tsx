import { PageHeader } from "@/components/layout/PageHeader";
import { SchedulerGrid } from "@/components/scheduler/SchedulerGrid";

export default function Scheduler() {
  return (
    <div className="flex flex-col h-screen bg-background">
      <div className="p-4 md:p-6">
        <PageHeader
          title="Stundenplan"
          description="Übersicht aller Lehrer und Buchungen"
        />
      </div>
      <div className="flex-1 overflow-hidden">
        <SchedulerGrid />
      </div>
    </div>
  );
}
