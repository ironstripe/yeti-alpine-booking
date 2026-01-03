import { PageHeader } from "@/components/layout";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { QuickStats } from "@/components/dashboard/QuickStats";
import { DailyTaskList } from "@/components/dashboard/DailyTaskList";
import { InboxPreview } from "@/components/dashboard/InboxPreview";
import { PendingAbsencesCard } from "@/components/dashboard/PendingAbsencesCard";
import { PendingActionsCard } from "@/components/dashboard/PendingActionsCard";
import { BookingInquiriesCard } from "@/components/dashboard/BookingInquiriesCard";
import { EmbeddedScheduler } from "@/components/dashboard/EmbeddedScheduler";

const Dashboard = () => {
  const today = new Date();
  const greeting = getGreeting();

  return (
    <>
      <PageHeader
        title="Morgen-Cockpit"
        description={`${greeting}! ${format(today, "EEEE, d. MMMM yyyy", { locale: de })}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-10rem)]">
        {/* Left: Action Center */}
        <div className="space-y-4 overflow-auto pr-1">
          <QuickStats />
          <DailyTaskList />
          <PendingActionsCard />
          <BookingInquiriesCard />
          <InboxPreview />
          <PendingAbsencesCard />
        </div>

        {/* Right: Embedded Scheduler */}
        <div className="overflow-hidden rounded-lg border bg-card min-h-[400px]">
          <EmbeddedScheduler defaultDays={2} />
        </div>
      </div>
    </>
  );
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Guten Morgen";
  if (hour < 18) return "Guten Tag";
  return "Guten Abend";
}

export default Dashboard;
