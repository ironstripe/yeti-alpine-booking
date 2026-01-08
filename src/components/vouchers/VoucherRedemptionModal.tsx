import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useRedeemVoucher } from "@/hooks/useVouchers";
import type { Voucher } from "@/hooks/useVouchers";

interface VoucherRedemptionModalProps {
  voucher: Voucher;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VoucherRedemptionModal({ voucher, open, onOpenChange }: VoucherRedemptionModalProps) {
  const [amount, setAmount] = useState(voucher.remaining_balance.toString());
  const [redemptionType, setRedemptionType] = useState<"manual" | "ticket">("manual");
  const [reason, setReason] = useState("");
  const [ticketSearch, setTicketSearch] = useState("");

  const redeemVoucher = useRedeemVoucher();

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
      minimumFractionDigits: 2,
    }).format(val);
  };

  const handleSubmit = () => {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0 || amountNum > voucher.remaining_balance) {
      return;
    }

    redeemVoucher.mutate(
      {
        voucherId: voucher.id,
        amount: amountNum,
        reason: redemptionType === "manual" ? reason : undefined,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      }
    );
  };

  const handleRedeemAll = () => {
    setAmount(voucher.remaining_balance.toString());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gutschein einlösen · {voucher.code}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">Verfügbares Guthaben:</p>
            <p className="text-xl font-bold">{formatCurrency(voucher.remaining_balance)}</p>
          </div>

          <div className="space-y-2">
            <Label>Einzulösender Betrag</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={voucher.remaining_balance}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" onClick={handleRedeemAll}>
                Alles einlösen
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <Label>Verknüpfen mit</Label>
            <RadioGroup value={redemptionType} onValueChange={(v) => setRedemptionType(v as "manual" | "ticket")}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="ticket" id="ticket" />
                <Label htmlFor="ticket" className="font-normal">
                  Buchung
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="manual" id="manual" />
                <Label htmlFor="manual" className="font-normal">
                  Manuelle Einlösung (ohne Buchung)
                </Label>
              </div>
            </RadioGroup>
          </div>

          {redemptionType === "ticket" && (
            <div className="space-y-2">
              <Label>Ticket suchen</Label>
              <Input
                placeholder="YETY-2025-..."
                value={ticketSearch}
                onChange={(e) => setTicketSearch(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Ticket-Verknüpfung wird in einer zukünftigen Version verfügbar sein.
              </p>
            </div>
          )}

          {redemptionType === "manual" && (
            <div className="space-y-2">
              <Label>Grund</Label>
              <Textarea
                placeholder="z.B. Barauszahlung auf Kundenwunsch"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={redeemVoucher.isPending || parseFloat(amount) <= 0 || parseFloat(amount) > voucher.remaining_balance}
          >
            Einlösen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
