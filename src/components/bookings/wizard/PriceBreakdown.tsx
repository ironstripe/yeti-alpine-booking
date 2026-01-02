import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { useBookingWizard } from "@/contexts/BookingWizardContext";

interface PriceBreakdownProps {
  discountPercent: number;
}

// Mock prices - in production these would come from products table
const MOCK_PRICES: Record<string, Record<number, number>> = {
  private: {
    1: 95,
    2: 180,
    4: 340,
  },
  group: {
    1: 85,
    2: 160,
    3: 225,
    4: 280,
    5: 325,
  },
};

const VAT_RATE = 0.077; // 7.7%

export function PriceBreakdown({ discountPercent }: PriceBreakdownProps) {
  const { state } = useBookingWizard();

  // Calculate prices
  const daysCount = state.selectedDates.length;
  const duration = state.duration || 2;
  const productType = state.productType || "private";

  // Get base price
  let unitPrice = 0;
  if (productType === "private") {
    unitPrice = MOCK_PRICES.private[duration] || 180;
  } else {
    unitPrice = MOCK_PRICES.group[daysCount] || 85;
  }

  const subtotal = productType === "private" ? unitPrice * daysCount : unitPrice;
  const discountAmount = subtotal * (discountPercent / 100);
  const afterDiscount = subtotal - discountAmount;
  const vatAmount = afterDiscount * VAT_RATE;
  const total = afterDiscount;

  const formatCurrency = (amount: number) => {
    return `CHF ${amount.toFixed(2)}`;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Preisdetails
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Line items */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <div>
              <p className="font-medium">
                {productType === "private" ? "Privatstunde" : "Gruppenkurs"}{" "}
                {duration}h ({state.sport === "snowboard" ? "Snowboard" : "Ski"})
              </p>
              <p className="text-sm text-muted-foreground">
                {productType === "private"
                  ? `${daysCount} Tag${daysCount > 1 ? "e" : ""} × ${formatCurrency(unitPrice)}`
                  : `${daysCount} Tag${daysCount > 1 ? "e" : ""}`}
              </p>
            </div>
            <span className="font-medium">{formatCurrency(subtotal)}</span>
          </div>

          <p className="text-sm text-muted-foreground">
            Teilnehmer: {state.selectedParticipants.length} Person
            {state.selectedParticipants.length > 1 ? "en" : ""}
            <br />
            <span className="text-xs">(Preis gilt für bis zu 2 Teilnehmer)</span>
          </p>
        </div>

        <Separator />

        {/* Subtotal */}
        <div className="flex justify-between text-sm">
          <span>Zwischensumme</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>

        {/* Discount */}
        {discountPercent > 0 && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Rabatt ({discountPercent}%)</span>
            <span>-{formatCurrency(discountAmount)}</span>
          </div>
        )}

        {/* VAT info */}
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>MwSt. (7.7%)</span>
          <span>{formatCurrency(vatAmount)}</span>
        </div>

        <Separator />

        {/* Total */}
        <div className="flex justify-between text-lg font-bold">
          <span>TOTAL</span>
          <span>{formatCurrency(total)}</span>
        </div>
        <p className="text-xs text-muted-foreground">(inkl. MwSt.)</p>
      </CardContent>
    </Card>
  );
}