import { UseFormReturn } from "react-hook-form";
import { CreditCard, Building, Info } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

type CreditAction = "customer_credit" | "refund_iban" | "refund_terminal" | "none";

interface CreditActionSelectorProps {
  creditAction: CreditAction;
  onCreditActionChange: (value: CreditAction) => void;
  form: UseFormReturn<any>;
  creditAmount: number;
}

export function CreditActionSelector({
  creditAction,
  onCreditActionChange,
  form,
  creditAmount,
}: CreditActionSelectorProps) {
  if (creditAmount <= 0) return null;

  return (
    <div className="space-y-3">
      <Label>Was soll mit dem Guthaben passieren?</Label>
      <RadioGroup
        value={creditAction}
        onValueChange={(v) => onCreditActionChange(v as CreditAction)}
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="customer_credit" id="credit-save" />
          <Label htmlFor="credit-save">
            Als Kundenguthaben speichern (für zukünftige Buchungen)
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="refund_iban" id="credit-iban" />
          <Label htmlFor="credit-iban" className="flex items-center gap-2">
            <Building className="h-4 w-4" />
            Rücküberweisung auf Bankkonto (IBAN)
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="refund_terminal" id="credit-terminal" />
          <Label htmlFor="credit-terminal" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Rückerstattung am Terminal (Desk)
          </Label>
        </div>
      </RadioGroup>

      {creditAction === "refund_iban" && (
        <div className="pl-6 space-y-3 p-4 border rounded-lg">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Der Kunde muss seine IBAN-Daten angeben. Die Rücküberweisung
              erfolgt innerhalb von 5-10 Werktagen.
            </AlertDescription>
          </Alert>
          <div className="space-y-2">
            <Label htmlFor="iban">IBAN *</Label>
            <Input
              id="iban"
              {...form.register("iban")}
              placeholder="CH93 0076 2011 6238 5295 7"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="accountHolder">Kontoinhaber *</Label>
            <Input
              id="accountHolder"
              {...form.register("accountHolder")}
              placeholder="Max Mustermann"
            />
          </div>
        </div>
      )}

      {creditAction === "refund_terminal" && (
        <Alert className="ml-6">
          <CreditCard className="h-4 w-4" />
          <AlertDescription>
            Bitte den Kunden bitten, am Desk mit der ursprünglichen
            Zahlungskarte die Rückerstattung entgegenzunehmen.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
