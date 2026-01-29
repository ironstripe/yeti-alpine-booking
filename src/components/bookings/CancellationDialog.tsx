import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

import { calculateCancellation, CancellationCalculation } from "@/lib/cancellation-utils";
import { useCancellation } from "@/hooks/useCancellation";
import {
  CancellationFinancialSummary,
  CreditActionSelector,
  FeeOptionsSelector,
  PartialCancellationSelector,
} from "./cancellation";

interface BookingForCancellation {
  id: string;
  ticket_number: string;
  customer_id: string;
  customer_name: string;
  product_name: string;
  start_date: string;
  end_date: string;
  start_time?: string;
  total_amount: number;
  amount_paid: number;
  booking_days: string[];
}

interface CancellationDialogProps {
  booking: BookingForCancellation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface CancellationFormData {
  cancellationType: "full" | "partial";
  cancelledDays: string[];
  cancellationReason: string;
  feeOption: "agb" | "waived" | "custom";
  customFee: number;
  waiverReason: string;
  creditAction: "customer_credit" | "refund_iban" | "refund_terminal" | "none";
  iban: string;
  accountHolder: string;
}

export function CancellationDialog({
  booking,
  open,
  onOpenChange,
  onSuccess,
}: CancellationDialogProps) {
  const [calculation, setCalculation] = useState<CancellationCalculation | null>(null);
  const cancellation = useCancellation();

  const form = useForm<CancellationFormData>({
    defaultValues: {
      cancellationType: "full",
      cancelledDays: [],
      cancellationReason: "",
      feeOption: "agb",
      customFee: 0,
      waiverReason: "",
      creditAction: "customer_credit",
      iban: "",
      accountHolder: "",
    },
  });

  const cancellationType = form.watch("cancellationType");
  const cancelledDays = form.watch("cancelledDays");
  const feeOption = form.watch("feeOption");
  const customFee = form.watch("customFee");
  const creditAction = form.watch("creditAction");

  // Calculate cancellation details whenever inputs change
  useEffect(() => {
    const calc = calculateCancellation(
      {
        start_date: booking.start_date,
        start_time: booking.start_time,
        total_amount: booking.total_amount,
        amount_paid: booking.amount_paid,
        booking_days: booking.booking_days,
      },
      {
        type: cancellationType,
        cancelledDays,
        feeOption,
        customFee,
      }
    );
    setCalculation(calc);
  }, [booking, cancellationType, cancelledDays, feeOption, customFee]);

  const onSubmit = async (data: CancellationFormData) => {
    if (!data.cancellationReason.trim()) {
      form.setError("cancellationReason", { message: "Stornierungsgrund erforderlich" });
      return;
    }

    if (calculation?.isWithin24h && data.feeOption !== "agb" && !data.waiverReason.trim()) {
      form.setError("waiverReason", { message: "Kulanz-Begründung erforderlich" });
      return;
    }

    if (data.creditAction === "refund_iban" && (!data.iban || !data.accountHolder)) {
      form.setError("iban", { message: "IBAN erforderlich für Rücküberweisung" });
      return;
    }

    await cancellation.mutateAsync({
      ticketId: booking.id,
      customerId: booking.customer_id,
      cancellationType: data.cancellationType,
      cancelledItemIds: data.cancellationType === "partial" ? data.cancelledDays : null,
      cancellationReason: data.cancellationReason,
      originalBookingAmount: booking.total_amount,
      cancelledAmount: calculation?.cancelledAmount || 0,
      amountAlreadyPaid: booking.amount_paid,
      feeAccordingToAgb: calculation?.feeAccordingToAgb || 0,
      feeCharged: calculation?.feeCharged || 0,
      waiverReason: data.waiverReason || null,
      hoursBeforeStart: calculation?.hoursBeforeStart || null,
      creditAction: data.creditAction,
      iban: data.iban || null,
      accountHolder: data.accountHolder || null,
    });

    onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Buchung stornieren</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Booking Info */}
          <div className="p-4 border rounded-lg bg-muted/30 space-y-1">
            <p className="font-semibold">{booking.ticket_number}</p>
            <p className="text-sm text-muted-foreground">
              {booking.customer_name} · {booking.product_name}
            </p>
            <p className="text-sm text-muted-foreground">
              {format(new Date(booking.start_date), "EEEE, dd. MMMM yyyy", { locale: de })}
              {booking.end_date !== booking.start_date &&
                ` – ${format(new Date(booking.end_date), "dd. MMMM yyyy", { locale: de })}`}
            </p>
            <div className="flex justify-between text-sm pt-2">
              <span>Buchungsbetrag:</span>
              <span>CHF {booking.total_amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Bereits bezahlt:</span>
              <span>CHF {booking.amount_paid.toFixed(2)}</span>
            </div>
          </div>

          {/* Partial Cancellation */}
          <PartialCancellationSelector
            bookingDays={booking.booking_days}
            cancellationType={cancellationType}
            cancelledDays={cancelledDays}
            onCancellationTypeChange={(type) => form.setValue("cancellationType", type)}
            onCancelledDaysChange={(days) => form.setValue("cancelledDays", days)}
          />

          {/* Cancellation Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Stornierungsgrund *</Label>
            <Textarea
              id="reason"
              {...form.register("cancellationReason")}
              placeholder="Grund für die Stornierung..."
              rows={2}
            />
            {form.formState.errors.cancellationReason && (
              <p className="text-sm text-destructive">
                {form.formState.errors.cancellationReason.message}
              </p>
            )}
          </div>

          {/* Fee Options */}
          <FeeOptionsSelector
            feeOption={feeOption}
            onFeeOptionChange={(v) => form.setValue("feeOption", v)}
            form={form}
            feeAccordingToAgb={calculation?.feeAccordingToAgb || 0}
            isWithin24h={calculation?.isWithin24h || false}
          />

          {/* Financial Summary */}
          <CancellationFinancialSummary calculation={calculation} />

          {/* Credit Action */}
          <CreditActionSelector
            creditAction={creditAction}
            onCreditActionChange={(v) => form.setValue("creditAction", v)}
            form={form}
            creditAmount={calculation?.creditAmount || 0}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" variant="destructive" disabled={cancellation.isPending}>
              {cancellation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Wird storniert...
                </>
              ) : (
                "Stornierung durchführen"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
