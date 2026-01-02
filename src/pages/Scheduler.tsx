import { PageHeader } from "@/components/layout/PageHeader";
import { SchedulerGrid } from "@/components/scheduler/SchedulerGrid";

export default function Scheduler() {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-screen">
      <PageHeader
        title="Ressourcenplaner"
        description="Übersicht aller Lehrer und Buchungen"
      />
      <div className="flex-1 overflow-hidden">
        <SchedulerGrid />
      </div>
    </div>
  );
}
