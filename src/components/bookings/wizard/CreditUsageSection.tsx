import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CreditUsageSectionProps {
  availableCredit: number;
  useCredit: boolean;
  creditToUse: number;
  maxAmount: number;
  onUseCreditChange: (use: boolean) => void;
  onCreditAmountChange: (amount: number) => void;
}

export function CreditUsageSection({
  availableCredit,
  useCredit,
  creditToUse,
  maxAmount,
  onUseCreditChange,
  onCreditAmountChange,
}: CreditUsageSectionProps) {
  if (availableCredit <= 0) return null;

  const maxCreditUsable = Math.min(availableCredit, maxAmount);

  return (
    <div className="p-4 border rounded-lg space-y-3 bg-green-50 border-green-200">
      <div className="flex items-center space-x-2">
        <Checkbox
          id="use-credit"
          checked={useCredit}
          onCheckedChange={(checked) => {
            onUseCreditChange(!!checked);
            if (checked) onCreditAmountChange(maxCreditUsable);
          }}
        />
        <Label htmlFor="use-credit" className="text-green-800">
          Guthaben verwenden (CHF {availableCredit.toFixed(2)} verfügbar)
        </Label>
      </div>

      {useCredit && (
        <div className="flex items-center gap-2 pl-6">
          <Label>Betrag:</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            max={maxCreditUsable}
            value={creditToUse}
            onChange={(e) =>
              onCreditAmountChange(
                Math.min(parseFloat(e.target.value) || 0, maxCreditUsable)
              )
            }
            className="w-32"
          />
          <span>CHF</span>
        </div>
      )}
    </div>
  );
}
