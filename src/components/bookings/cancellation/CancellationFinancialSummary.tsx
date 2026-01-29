import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

interface CancellationCalculation {
  isWithin24h: boolean;
  hoursBeforeStart: number;
  cancelledAmount: number;
  paidForCancelledPortion: number;
  feeAccordingToAgb: number;
  feeCharged: number;
  creditAmount: number;
}

interface CancellationFinancialSummaryProps {
  calculation: CancellationCalculation | null;
}

export function CancellationFinancialSummary({ calculation }: CancellationFinancialSummaryProps) {
  if (!calculation) return null;

  return (
    <div className="space-y-3">
      {calculation.isWithin24h && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Achtung: Stornierung weniger als 24 Stunden vor Kursbeginn.
            Gemäss AGB ist der volle Betrag als Stornogebühr fällig.
          </AlertDescription>
        </Alert>
      )}

      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
        <p className="font-medium text-blue-900">Finanzielle Auswirkung</p>
        <div className="text-sm space-y-1">
          <div className="flex justify-between">
            <span>Stornierter Betrag:</span>
            <span>CHF {calculation.cancelledAmount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Davon bezahlt:</span>
            <span>CHF {calculation.paidForCancelledPortion.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Stornogebühr:</span>
            <span>CHF {calculation.feeCharged.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-medium pt-2 border-t">
            <span>Guthaben für Kunde:</span>
            <span className="text-green-700">CHF {calculation.creditAmount.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
