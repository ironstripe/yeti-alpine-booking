import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle, Printer, Plus, X } from "lucide-react";

interface SaleSuccessModalProps {
  open: boolean;
  onClose: () => void;
  onNewSale: () => void;
  transactionNumber: string;
  total: number;
  paymentMethod: string;
}

export function SaleSuccessModal({
  open,
  onClose,
  onNewSale,
  transactionNumber,
  total,
  paymentMethod,
}: SaleSuccessModalProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
    }).format(value);
  };

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      cash: "Bar",
      card: "Karte",
      twint: "TWINT",
      invoice: "Auf Rechnung",
    };
    return labels[method] || method;
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="sr-only">Verkauf erfolgreich</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center text-center py-6">
          <div className="rounded-full bg-green-100 p-3 mb-4">
            <CheckCircle className="h-12 w-12 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Verkauf erfolgreich!</h2>
          <div className="space-y-1 text-muted-foreground">
            <p>Beleg-Nr: <span className="font-medium text-foreground">{transactionNumber}</span></p>
            <p>Total: <span className="font-bold text-foreground text-lg">{formatCurrency(total)}</span></p>
            <p>Bezahlt: <span className="font-medium text-foreground">{getPaymentMethodLabel(paymentMethod)}</span></p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={handlePrint} variant="outline">
            <Printer className="mr-2 h-4 w-4" />
            Beleg drucken
          </Button>
          <Button onClick={onNewSale}>
            <Plus className="mr-2 h-4 w-4" />
            Neuer Verkauf
          </Button>
          <Button variant="ghost" onClick={onClose}>
            <X className="mr-2 h-4 w-4" />
            Schliessen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
