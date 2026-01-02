import { useState } from "react";
import { Check, X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface DiscountSectionProps {
  discountPercent: number;
  discountReason: string;
  onDiscountChange: (percent: number, reason: string) => void;
}

export function DiscountSection({
  discountPercent,
  discountReason,
  onDiscountChange,
}: DiscountSectionProps) {
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherError, setVoucherError] = useState<string | null>(null);
  const [appliedVoucher, setAppliedVoucher] = useState<{ code: string; value: number } | null>(null);

  const handleVoucherSubmit = () => {
    // Mock voucher validation - in production this would check against DB
    if (voucherCode.toUpperCase() === "WINTER2024") {
      setAppliedVoucher({ code: voucherCode.toUpperCase(), value: 50 });
      setVoucherError(null);
      setVoucherCode("");
    } else if (voucherCode.toUpperCase() === "STAMM10") {
      onDiscountChange(10, "Stammkunden-Rabatt");
      setVoucherError(null);
      setVoucherCode("");
    } else {
      setVoucherError("Ungültiger Gutscheincode");
    }
  };

  const removeVoucher = () => {
    setAppliedVoucher(null);
  };

  const handleDiscountPercentChange = (value: string) => {
    const percent = parseInt(value) || 0;
    onDiscountChange(Math.min(100, Math.max(0, percent)), discountReason);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Rabatt
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Voucher Code */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="Gutscheincode eingeben..."
              value={voucherCode}
              onChange={(e) => setVoucherCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleVoucherSubmit()}
            />
            <Button variant="outline" onClick={handleVoucherSubmit}>
              Einlösen
            </Button>
          </div>
          {voucherError && (
            <p className="text-sm text-destructive">{voucherError}</p>
          )}
        </div>

        {/* Applied Voucher */}
        {appliedVoucher && (
          <div className="flex items-center justify-between rounded-lg bg-green-50 p-3 dark:bg-green-950/20">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              <span className="text-sm">
                Gutschein {appliedVoucher.code} eingelöst: -CHF {appliedVoucher.value.toFixed(2)}
              </span>
            </div>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={removeVoucher}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Manual Discount */}
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Oder manueller Rabatt:</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="0"
              max="100"
              value={discountPercent || ""}
              onChange={(e) => handleDiscountPercentChange(e.target.value)}
              className="w-20"
              placeholder="0"
            />
            <span className="text-muted-foreground">%</span>
            <span className="text-muted-foreground">Grund:</span>
            <Input
              placeholder="Stammkunde"
              value={discountReason}
              onChange={(e) => onDiscountChange(discountPercent, e.target.value)}
              className="flex-1"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}