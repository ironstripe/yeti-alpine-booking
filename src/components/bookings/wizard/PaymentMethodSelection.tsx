import { format, addDays } from "date-fns";
import { Banknote, CreditCard, Smartphone, FileText, Calendar, Gift, Building2, AlertCircle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useBillingPartners } from "@/hooks/useBillingPartners";
import { IMMEDIATE_PAYMENT_METHODS, PaymentMethod, SettlementChoice } from "@/lib/finance";

interface PaymentMethodSelectionProps {
  paymentMethod: PaymentMethod | null;
  settlement: SettlementChoice;
  billingPartnerId: string | null;
  paymentDueDate: string | null;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  onSettlementChange: (settlement: SettlementChoice) => void;
  onBillingPartnerChange: (id: string | null) => void;
  onPaymentDueDateChange: (date: string | null) => void;
  firstCourseDate: string | null;
}

const PAYMENT_OPTIONS: { id: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { id: "cash", label: "Bar", icon: Banknote },
  { id: "card", label: "Karte", icon: CreditCard },
  { id: "twint", label: "TWINT", icon: Smartphone },
  { id: "voucher", label: "Gutschein", icon: Gift },
  { id: "invoice", label: "Rechnung", icon: FileText },
  { id: "hotel", label: "Hotel", icon: Building2 },
];

export function PaymentMethodSelection({
  paymentMethod,
  settlement,
  billingPartnerId,
  paymentDueDate,
  onPaymentMethodChange,
  onSettlementChange,
  onBillingPartnerChange,
  onPaymentDueDateChange,
  firstCourseDate,
}: PaymentMethodSelectionProps) {
  const { data: hotels = [] } = useBillingPartners({ activeOnly: true });

  const getDefaultDueDate = () => {
    if (!firstCourseDate) return format(addDays(new Date(), 7), "yyyy-MM-dd");
    const courseDate = new Date(firstCourseDate);
    return format(addDays(courseDate, -7), "yyyy-MM-dd");
  };

  const handlePaymentMethodChange = (method: PaymentMethod) => {
    onPaymentMethodChange(method);

    // Invoice and hotel billing always leave an open balance
    if (method === "invoice" || method === "hotel") {
      onSettlementChange("pay_later");
      if (!paymentDueDate) onPaymentDueDateChange(getDefaultDueDate());
    }
    if (method !== "hotel") {
      onBillingPartnerChange(null);
    }
  };

  const immediateAllowed = IMMEDIATE_PAYMENT_METHODS.includes(paymentMethod as PaymentMethod);
  const showDueDate = settlement === "pay_later";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Zahlung
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Wie wird der Betrag beglichen?</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                    className={cn("h-6 w-6", isSelected ? "text-primary" : "text-muted-foreground")}
                  />
                  <span className={cn("text-sm font-medium", isSelected && "text-primary")}>
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Hotel selector */}
        {paymentMethod === "hotel" && (
          <div className="space-y-2 rounded-lg border p-4">
            <Label htmlFor="billing-hotel">Rechnungshotel *</Label>
            <Select
              value={billingPartnerId ?? undefined}
              onValueChange={(value) => onBillingPartnerChange(value)}
            >
              <SelectTrigger id="billing-hotel">
                <SelectValue placeholder="Hotel auswählen" />
              </SelectTrigger>
              <SelectContent>
                {hotels.map((hotel) => (
                  <SelectItem key={hotel.id} value={hotel.id}>
                    {hotel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hotels.length === 0 && (
              <p className="flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="h-3 w-3" />
                Keine aktiven Hotels erfasst – bitte unter Einstellungen → Hotels anlegen.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Der Kunde bleibt Inhaber der Buchung. Der offene Betrag wird dem Hotel zugeordnet und
              bleibt offen, bis eine Zahlung erfasst wird.
            </p>
          </div>
        )}

        {/* Settlement choice */}
        <div className="space-y-3">
          <Label>Zahlungsstatus</Label>
          <RadioGroup
            value={settlement}
            onValueChange={(value) => onSettlementChange(value as SettlementChoice)}
            className="grid gap-2 sm:grid-cols-2"
          >
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-4",
                settlement === "paid_now" && "border-primary bg-primary/5"
              )}
            >
              <RadioGroupItem value="paid_now" id="settle-now" disabled={!immediateAllowed} />
              <span className="space-y-1">
                <span className="block text-sm font-medium">Jetzt bezahlt</span>
                <span className="block text-xs text-muted-foreground">
                  Betrag wird sofort erfasst (Bar, Karte, TWINT oder Gutschein).
                </span>
              </span>
            </label>

            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-4",
                settlement === "pay_later" && "border-primary bg-primary/5"
              )}
            >
              <RadioGroupItem value="pay_later" id="settle-later" />
              <span className="space-y-1">
                <span className="block text-sm font-medium">Offener Betrag / später bezahlen</span>
                <span className="block text-xs text-muted-foreground">
                  Buchung bleibt offen und erscheint in „Unbezahlte Kurse“.
                </span>
              </span>
            </label>
          </RadioGroup>

          {!immediateAllowed && paymentMethod && (
            <p className="text-xs text-muted-foreground">
              Für Rechnung und Hotel bleibt der Betrag offen, bis eine Zahlung erfasst wird.
            </p>
          )}
        </div>

        {/* Payment due date */}
        {showDueDate && (
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
                <span className="text-xs text-muted-foreground">(7 Tage vor Kursbeginn)</span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
