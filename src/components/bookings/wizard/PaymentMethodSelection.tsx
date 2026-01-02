import { format, addDays } from "date-fns";
import { de } from "date-fns/locale";
import { Banknote, CreditCard, Smartphone, FileText, Calendar } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type PaymentMethod = "cash" | "card" | "twint" | "invoice";

interface PaymentMethodSelectionProps {
  paymentMethod: PaymentMethod | null;
  isPaid: boolean;
  paymentDueDate: string | null;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  onIsPaidChange: (isPaid: boolean) => void;
  onPaymentDueDateChange: (date: string | null) => void;
  firstCourseDate: string | null;
}

const PAYMENT_OPTIONS: { id: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { id: "cash", label: "Bar", icon: Banknote },
  { id: "card", label: "Karte", icon: CreditCard },
  { id: "twint", label: "TWINT", icon: Smartphone },
  { id: "invoice", label: "Rechnung", icon: FileText },
];

export function PaymentMethodSelection({
  paymentMethod,
  isPaid,
  paymentDueDate,
  onPaymentMethodChange,
  onIsPaidChange,
  onPaymentDueDateChange,
  firstCourseDate,
}: PaymentMethodSelectionProps) {
  // Calculate default due date (7 days before course start)
  const getDefaultDueDate = () => {
    if (!firstCourseDate) return format(addDays(new Date(), 7), "yyyy-MM-dd");
    const courseDate = new Date(firstCourseDate);
    return format(addDays(courseDate, -7), "yyyy-MM-dd");
  };

  const handlePaymentMethodChange = (method: PaymentMethod) => {
    onPaymentMethodChange(method);
    // Set default due date for invoice
    if (method === "invoice" && !paymentDueDate) {
      onPaymentDueDateChange(getDefaultDueDate());
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Zahlungsart
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Wie möchte der Kunde bezahlen?
        </p>

        {/* Payment Method Options */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PAYMENT_OPTIONS.map((option) => {
            const Icon = option.icon;
            const isSelected = paymentMethod === option.id;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => handlePaymentMethodChange(option.id)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border p-4 transition-all",
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:border-primary/50"
                )}
              >
                <Icon
                  className={cn(
                    "h-6 w-6",
                    isSelected ? "text-primary" : "text-muted-foreground"
                  )}
                />
                <span className={cn("text-sm font-medium", isSelected && "text-primary")}>
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Already Paid Checkbox */}
        <div className="flex items-center gap-3 rounded-lg border p-4">
          <Checkbox
            id="is-paid"
            checked={isPaid}
            onCheckedChange={(checked) => onIsPaidChange(checked === true)}
          />
          <label htmlFor="is-paid" className="cursor-pointer text-sm">
            Bereits bezahlt
          </label>
        </div>

        {/* Payment Due Date (for invoice) */}
        {paymentMethod === "invoice" && !isPaid && (
          <div className="space-y-2">
            <Label htmlFor="due-date">Zahlungsfrist</Label>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input
                id="due-date"
                type="date"
                value={paymentDueDate || getDefaultDueDate()}
                onChange={(e) => onPaymentDueDateChange(e.target.value)}
                className="w-auto"
              />
              {firstCourseDate && (
                <span className="text-xs text-muted-foreground">
                  (7 Tage vor Kursbeginn)
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}