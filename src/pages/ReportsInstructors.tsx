import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { DateRangeSelector } from "@/components/reports/DateRangeSelector";
import { InstructorRankingTable } from "@/components/reports/InstructorRankingTable";
import { InstructorUtilizationChart } from "@/components/reports/InstructorUtilizationChart";
import { PayrollTable } from "@/components/reports/PayrollTable";
import { ExportModal } from "@/components/reports/ExportModal";
import { DateRange, getDateRangePresets, useInstructorStats } from "@/hooks/useReportsData";

export default function ReportsInstructors() {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRangePresets()[3].getValue());
  const [exportOpen, setExportOpen] = useState(false);

  const { data: instructorStats, isLoading } = useInstructorStats(dateRange);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Skilehrer-Auswertung" 
        description="Stunden, Auslastung und Lohnabrechnung"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/reports")} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Zurück
            </Button>
            <Button variant="outline" onClick={() => setExportOpen(true)} className="gap-2">
              <Download className="h-4 w-4" /> Export
            </Button>
          </div>
        }
      />
      
      <DateRangeSelector dateRange={dateRange} onDateRangeChange={setDateRange} />
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <InstructorRankingTable data={instructorStats} isLoading={isLoading} />
        <InstructorUtilizationChart data={instructorStats} isLoading={isLoading} />
      </div>
      
      <PayrollTable data={instructorStats} isLoading={isLoading} periodLabel={dateRange.label} />

      <ExportModal 
        open={exportOpen} 
        onOpenChange={setExportOpen}
        reportTitle="Skilehrer-Auswertung"
        dateRange={dateRange}
        onExport={() => {}}
      />
    </div>
  );
}
