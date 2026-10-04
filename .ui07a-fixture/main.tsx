import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { SchedulerSelectionProvider } from "../src/contexts/SchedulerSelectionContext";
import { SchedulerHeader, type ViewMode } from "../src/components/scheduler/SchedulerHeader";
import type { SchedulerFilters } from "../src/components/scheduler/SchedulerSettingsMenu";
import "../src/index.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const initialFilters: SchedulerFilters = {
  disciplines: [], instructorIds: [], specializationIds: [], bookingTypeFilter: null,
  showUnconfirmedOnly: false, showFreeInstructorsOnly: false, showCrossDisciplineOnly: false,
  isFullscreen: false, sortBy: "name", compactMode: false, showLegend: true,
};
function Fixture() {
  const [collapsed, setCollapsed] = useState(false);
  const [filters, setFilters] = useState(initialFilters);
  const [date, setDate] = useState(new Date("2027-02-15T12:00:00"));
  const [viewMode, setViewMode] = useState<ViewMode>("daily");
  const patch = (next: Partial<SchedulerFilters>) => setFilters((current) => ({ ...current, ...next }));
  return <div data-testid="shell" className="flex h-[100dvh] min-h-0 w-full overflow-hidden bg-background">
    {!filters.isFullscreen && <aside data-testid="sidebar" className={collapsed ? "w-16 shrink-0 border-r" : "w-[250px] shrink-0 border-r"}>
      <button data-testid="sidebar-toggle" onClick={() => setCollapsed((v) => !v)}>Sidebar</button>
    </aside>}
    <div className="flex min-w-0 flex-1 flex-col">
      {!filters.isFullscreen && <div data-testid="app-header" className="h-14 shrink-0 border-b" />}
      <main className="min-h-0 flex-1 overflow-hidden">
        <div className={filters.isFullscreen ? "fixed inset-0 z-50 flex min-h-0 min-w-0 flex-col bg-background" : "flex h-full min-h-0 min-w-0 flex-col bg-background"}>
          {!filters.isFullscreen && <header data-testid="page-heading" className="shrink-0 px-4 py-2"><h1 className="text-xl font-bold">Stundenplan</h1></header>}
          <SchedulerHeader date={date} onDateChange={setDate} viewMode={viewMode} onViewModeChange={setViewMode}
            instructorOptions={[{id:"i-1",name:"Anna Beispiel"}]} filters={filters} onFiltersChange={patch}
            compactStats={{visible:12,total:18}} />
          <div data-testid="grid-scroll" className="min-h-0 flex-1 overflow-auto">
            <div data-testid="sticky-header" className="sticky top-0 h-10 border-b bg-background">09:00 · 10:00 · 11:00</div>
            {Array.from({length:18}, (_, i) => <div key={i} data-testid="grid-row" className="h-[41px] border-b">Lehrer {i+1}</div>)}
          </div>
        </div>
      </main>
    </div>
  </div>;
}
sessionStorage.setItem("yeti.scheduler.planningDraft.v1", JSON.stringify({ selections: [{ id: "fixture-slot", instructorId: "i-1", date: "2027-02-15", startTime: "10:00", endTime: "12:00", durationMinutes: 120 }], multiSelectMode: true }));
createRoot(document.getElementById("root")!).render(<React.StrictMode><QueryClientProvider client={queryClient}><MemoryRouter><TooltipProvider><SchedulerSelectionProvider><Fixture /></SchedulerSelectionProvider></TooltipProvider></MemoryRouter></QueryClientProvider></React.StrictMode>);
