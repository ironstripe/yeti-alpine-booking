import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { DateRangeSelector } from "@/components/reports/DateRangeSelector";
import { BookingTrendsChart } from "@/components/reports/BookingTrendsChart";
import { ProductMixTable } from "@/components/reports/ProductMixTable";
import { ExportModal } from "@/components/reports/ExportModal";
import { DateRange, getDateRangePresets, useBookingTrends, useProductMix } from "@/hooks/useReportsData";

export default function ReportsBookings() {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRangePresets()[3].getValue());
  const [exportOpen, setExportOpen] = useState(false);

  const { data: bookingTrends, isLoading: loadingTrends } = useBookingTrends(dateRange);
  const { data: productMix, isLoading: loadingMix } = useProductMix(dateRange);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Buchungs-Analyse" 
        description="Trends und Produktmix"
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
      
      <BookingTrendsChart data={bookingTrends} isLoading={loadingTrends} />
      
      <ProductMixTable data={productMix} isLoading={loadingMix} />

      <ExportModal 
        open={exportOpen} 
        onOpenChange={setExportOpen}
        reportTitle="Buchungs-Analyse"
        dateRange={dateRange}
        onExport={() => {}}
      />
    </div>
  );
}
