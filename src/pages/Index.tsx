import { PageHeader } from "@/components/layout";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { KpiCards } from "@/components/dashboard/KpiCards";
import { NewRequestsBox } from "@/components/dashboard/NewRequestsBox";
import { OpenBookingsBox } from "@/components/dashboard/OpenBookingsBox";
import { ActionRequiredBox } from "@/components/dashboard/ActionRequiredBox";
import { AbsenceRequestsBox } from "@/components/dashboard/AbsenceRequestsBox";
import { DailyTasksPlaceholder } from "@/components/dashboard/DailyTasksPlaceholder";
import { CompactDailySchedule } from "@/components/dashboard/CompactDailySchedule";

const Dashboard = () => {
  const today = new Date();
  const greeting = getGreeting();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Morgen-Cockpit"
        description={`${greeting}! ${format(today, "EEEE, d. MMMM yyyy", { locale: de })}`}
      />

      {/* 1. KPI Cards - 3 columns, no revenue */}
      <KpiCards />

      {/* 2. Main Task Grid (2x2) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NewRequestsBox />
        <OpenBookingsBox />
        <ActionRequiredBox />
        <AbsenceRequestsBox />
      </div>

      {/* 3. Daily Tasks Checklist (Placeholder) */}
      <DailyTasksPlaceholder />

      {/* 4. Compact Daily Schedule */}
      <CompactDailySchedule />
    </div>
  );
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Guten Morgen";
  if (hour < 18) return "Guten Tag";
  return "Guten Abend";
}

export default Dashboard;
