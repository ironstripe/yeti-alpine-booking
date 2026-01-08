import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { DateRangeSelector } from "@/components/reports/DateRangeSelector";
import { CustomerStatsCards } from "@/components/reports/CustomerStatsCards";
import { CustomerSegmentsTable } from "@/components/reports/CustomerSegmentsTable";
import { CustomerOriginTable } from "@/components/reports/CustomerOriginTable";
import { ExportModal } from "@/components/reports/ExportModal";
import { DateRange, getDateRangePresets, useCustomerStats, useCustomerSegments, useCustomerOrigin } from "@/hooks/useReportsData";

export default function ReportsCustomers() {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRangePresets()[5].getValue());
  const [exportOpen, setExportOpen] = useState(false);

  const { data: customerStats, isLoading: loadingStats } = useCustomerStats(dateRange);
  const { data: segments, isLoading: loadingSegments } = useCustomerSegments(dateRange);
  const { data: origins, isLoading: loadingOrigins } = useCustomerOrigin(dateRange);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Kunden-Statistik" 
        description="Segmente und Herkunft"
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
      
      <CustomerStatsCards stats={customerStats} isLoading={loadingStats} />
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CustomerSegmentsTable data={segments} isLoading={loadingSegments} />
        <CustomerOriginTable data={origins} isLoading={loadingOrigins} />
      </div>

      <ExportModal 
        open={exportOpen} 
        onOpenChange={setExportOpen}
        reportTitle="Kunden-Statistik"
        dateRange={dateRange}
        onExport={() => {}}
      />
    </div>
  );
}
