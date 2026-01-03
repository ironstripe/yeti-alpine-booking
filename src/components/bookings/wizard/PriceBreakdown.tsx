import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useBookingWizard } from "@/contexts/BookingWizardContext";

interface PriceBreakdownProps {
  discountPercent: number;
  autoDiscountPercent?: number;
  autoDiscountReason?: string;
}

const VAT_RATE = 0.077; // 7.7%

export function PriceBreakdown({
  discountPercent,
  autoDiscountPercent = 0,
  autoDiscountReason,
}: PriceBreakdownProps) {
  const { state } = useBookingWizard();

  // Fetch products from database
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  // Calculate prices from real products
  const daysCount = state.selectedDates.length;
  const duration = state.duration || 2;
  const productType = state.productType || "private";

  // Find matching product
  let unitPrice = 0;
  let productName = "";

  if (productType === "private" && state.sport) {
    const durationMinutes = duration * 60;
    const sportName = state.sport === "ski" ? "Ski" : "Snowboard";
    const product = products.find(
      (p) =>
        p.type === "private" &&
        p.duration_minutes === durationMinutes &&
        p.name.includes(sportName)
    );
    unitPrice = product?.price || 180;
    productName = product?.name || `Privatstunde ${duration}h`;
  } else if (productType === "group") {
    const product = products.find(
      (p) => p.type === "group" && p.name.includes(`${daysCount} Tag`)
    );
    unitPrice = product?.price || 85;
    productName = product?.name || `Gruppenkurs ${daysCount} Tag(e)`;
  }

  // Add lunch if selected
  const lunchProduct = products.find((p) => p.type === "lunch");
  const lunchTotal =
    state.includeLunch && lunchProduct ? lunchProduct.price * daysCount : 0;

  // Combine manual and auto discounts
  const totalDiscountPercent = discountPercent + autoDiscountPercent;

  const subtotal =
    (productType === "private" ? unitPrice * daysCount : unitPrice) + lunchTotal;
  const discountAmount = subtotal * (totalDiscountPercent / 100);
  const afterDiscount = subtotal - discountAmount;
  const vatAmount = afterDiscount * VAT_RATE;
  const total = afterDiscount;

  const formatCurrency = (amount: number) => {
    return `CHF ${amount.toFixed(2)}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Preisdetails
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-6 w-1/2" />
        </CardContent>
      </Card>
    );
  }

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
              <p className="font-medium">{productName}</p>
              <p className="text-sm text-muted-foreground">
                {productType === "private"
                  ? `${daysCount} Tag${daysCount > 1 ? "e" : ""} × ${formatCurrency(unitPrice)}`
                  : `${daysCount} Tag${daysCount > 1 ? "e" : ""}`}
              </p>
            </div>
            <span className="font-medium">
              {formatCurrency(
                productType === "private" ? unitPrice * daysCount : unitPrice
              )}
            </span>
          </div>

          {state.includeLunch && lunchProduct && (
            <div className="flex justify-between">
              <div>
                <p className="font-medium">{lunchProduct.name}</p>
                <p className="text-sm text-muted-foreground">
                  {daysCount} Tag{daysCount > 1 ? "e" : ""} ×{" "}
                  {formatCurrency(lunchProduct.price)}
                </p>
              </div>
              <span className="font-medium">{formatCurrency(lunchTotal)}</span>
            </div>
          )}

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

        {/* Auto Discount */}
        {autoDiscountPercent > 0 && autoDiscountReason && (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-green-600">
              <Check className="h-4 w-4" />
              <span>{autoDiscountReason} ({autoDiscountPercent}%)</span>
            </div>
            <span className="text-green-600">
              -{formatCurrency(subtotal * (autoDiscountPercent / 100))}
            </span>
          </div>
        )}

        {/* Manual Discount */}
        {discountPercent > 0 && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Manueller Rabatt ({discountPercent}%)</span>
            <span>-{formatCurrency(subtotal * (discountPercent / 100))}</span>
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
