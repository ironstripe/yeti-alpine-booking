import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format, addYears } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { useExtendVoucher } from "@/hooks/useVouchers";
import type { Voucher } from "@/hooks/useVouchers";

interface VoucherExtendModalProps {
  voucher: Voucher;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VoucherExtendModal({ voucher, open, onOpenChange }: VoucherExtendModalProps) {
  const [newDate, setNewDate] = useState<Date>(addYears(new Date(), 1));
  const extendVoucher = useExtendVoucher();

  const handleSubmit = () => {
    extendVoucher.mutate(
      {
        id: voucher.id,
        newExpiryDate: format(newDate, "yyyy-MM-dd"),
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gültigkeit verlängern · {voucher.code}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="p-3 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">Aktuelles Ablaufdatum:</p>
            <p className="font-medium">
              {format(new Date(voucher.expiry_date), "dd. MMMM yyyy", { locale: de })}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Neues Ablaufdatum</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !newDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {newDate ? format(newDate, "dd. MMMM yyyy", { locale: de }) : "Datum wählen"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={newDate}
                  onSelect={(date) => date && setNewDate(date)}
                  disabled={(date) => date < new Date()}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={extendVoucher.isPending}>
            Verlängern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
