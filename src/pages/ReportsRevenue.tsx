import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { DateRangeSelector } from "@/components/reports/DateRangeSelector";
import { RevenueChart } from "@/components/reports/RevenueChart";
import { RevenueCategoryTable } from "@/components/reports/RevenueCategoryTable";
import { PaymentMethodChart } from "@/components/reports/PaymentMethodChart";
import { ExportModal } from "@/components/reports/ExportModal";
import { DateRange, getDateRangePresets, useDailyRevenue, useRevenueByCategory, usePaymentMethodBreakdown } from "@/hooks/useReportsData";

export default function ReportsRevenue() {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRangePresets()[1].getValue());
  const [exportOpen, setExportOpen] = useState(false);

  const { data: dailyRevenue, isLoading: loadingDaily } = useDailyRevenue(dateRange);
  const { data: categoryRevenue, isLoading: loadingCategory } = useRevenueByCategory(dateRange);
  const { data: paymentMethods, isLoading: loadingPayments } = usePaymentMethodBreakdown(dateRange);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Umsatz & Einnahmen" 
        description="Umsatzentwicklung und Zahlungsübersicht"
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
      
      <RevenueChart data={dailyRevenue} isLoading={loadingDaily} />
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RevenueCategoryTable data={categoryRevenue} isLoading={loadingCategory} />
        <PaymentMethodChart data={paymentMethods} isLoading={loadingPayments} />
      </div>

      <ExportModal 
        open={exportOpen} 
        onOpenChange={setExportOpen}
        reportTitle="Umsatzbericht"
        dateRange={dateRange}
        onExport={() => {}}
      />
    </div>
  );
}
