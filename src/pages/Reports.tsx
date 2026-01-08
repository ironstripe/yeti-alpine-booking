import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { DateRangeSelector } from "@/components/reports/DateRangeSelector";
import { ReportQuickStats } from "@/components/reports/ReportQuickStats";
import { ReportCategoryCards } from "@/components/reports/ReportCategoryCards";
import { DateRange, getDateRangePresets, useQuickStats } from "@/hooks/useReportsData";

export default function Reports() {
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const presets = getDateRangePresets();
    return presets.find(p => p.label === "Dieser Monat")?.getValue() || presets[0].getValue();
  });

  const { data: quickStats, isLoading } = useQuickStats(dateRange);

  return (
    <div className="space-y-6">
      <PageHeader title="Berichte & Statistiken" description="Übersicht und Auswertungen" />
      
      <DateRangeSelector dateRange={dateRange} onDateRangeChange={setDateRange} />
      
      <ReportQuickStats stats={quickStats} isLoading={isLoading} />
      
      <ReportCategoryCards />
    </div>
  );
}
