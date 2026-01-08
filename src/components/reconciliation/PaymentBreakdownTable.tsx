import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Banknote, CreditCard, Smartphone, FileText, Ticket, ShoppingCart } from "lucide-react";
import type { DayPaymentBreakdown } from "@/hooks/useReconciliation";

const paymentMethodConfig: Record<string, { label: string; icon: typeof Banknote; needsReconciliation: boolean }> = {
  bar: { label: "Bargeld", icon: Banknote, needsReconciliation: true },
  karte: { label: "Kreditkarte", icon: CreditCard, needsReconciliation: true },
  twint: { label: "TWINT", icon: Smartphone, needsReconciliation: true },
  rechnung: { label: "Rechnung", icon: FileText, needsReconciliation: false },
  gutschein: { label: "Gutschein", icon: Ticket, needsReconciliation: false },
  other: { label: "Sonstiges", icon: Banknote, needsReconciliation: false },
};

interface PaymentBreakdownTableProps {
  breakdown: DayPaymentBreakdown[];
  shopBreakdown?: DayPaymentBreakdown[];
  cashActual: number | null;
  cardActual: number | null;
  twintActual: number | null;
  onCashActualChange: (value: number | null) => void;
  onCardActualChange: (value: number | null) => void;
  onTwintActualChange: (value: number | null) => void;
  isLocked: boolean;
}

export function PaymentBreakdownTable({
  breakdown,
  shopBreakdown = [],
  cashActual,
  cardActual,
  twintActual,
  onCashActualChange,
  onCardActualChange,
  onTwintActualChange,
  isLocked,
}: PaymentBreakdownTableProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  // Combine bookings and shop breakdowns
  const getCombinedData = (method: string) => {
    const bookingItem = breakdown.find((b) => b.method === method);
    const shopItem = shopBreakdown.find((b) => b.method === method);
    
    return {
      bookingTotal: bookingItem?.total || 0,
      bookingCount: bookingItem?.count || 0,
      shopTotal: shopItem?.total || 0,
      shopCount: shopItem?.count || 0,
      combinedTotal: (bookingItem?.total || 0) + (shopItem?.total || 0),
      combinedCount: (bookingItem?.count || 0) + (shopItem?.count || 0),
    };
  };

  const allMethods = ["bar", "karte", "twint", "rechnung", "gutschein"];
  const hasShopData = shopBreakdown.length > 0;

  // Calculate totals
  const bookingTotal = breakdown.reduce((sum, b) => sum + b.total, 0);
  const shopTotal = shopBreakdown.reduce((sum, b) => sum + b.total, 0);

  const reconcilableBooking = ["bar", "karte", "twint"].reduce(
    (sum, m) => sum + (breakdown.find((b) => b.method === m)?.total || 0),
    0
  );
  const reconcilableShop = ["bar", "karte", "twint"].reduce(
    (sum, m) => sum + (shopBreakdown.find((b) => b.method === m)?.total || 0),
    0
  );
  const reconcilableTotal = reconcilableBooking + reconcilableShop;
  const actualTotal = (cashActual ?? 0) + (cardActual ?? 0) + (twintActual ?? 0);

  const handleInputChange = (
    value: string,
    setter: (val: number | null) => void
  ) => {
    if (value === "") {
      setter(null);
    } else {
      const num = parseFloat(value);
      setter(isNaN(num) ? null : num);
    }
  };

  const displayMethods = allMethods.filter((m) => {
    const data = getCombinedData(m);
    return data.combinedCount > 0 || m === "bar" || m === "karte" || m === "twint";
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Zahlungsübersicht</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Zahlungsart</TableHead>
              <TableHead className="text-right">Buchungen</TableHead>
              {hasShopData && <TableHead className="text-right">Shop</TableHead>}
              <TableHead className="text-right">Soll</TableHead>
              <TableHead className="text-right">Ist</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayMethods.map((method) => {
              const config = paymentMethodConfig[method] || paymentMethodConfig.other;
              const Icon = config.icon;
              const data = getCombinedData(method);

              let actual: number | null = null;
              let onActualChange: ((val: number | null) => void) | null = null;

              if (method === "bar") {
                actual = cashActual;
                onActualChange = onCashActualChange;
              } else if (method === "karte") {
                actual = cardActual;
                onActualChange = onCardActualChange;
              } else if (method === "twint") {
                actual = twintActual;
                onActualChange = onTwintActualChange;
              }

              return (
                <TableRow key={method}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {config.label}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{formatCurrency(data.bookingTotal)}</TableCell>
                  {hasShopData && (
                    <TableCell className="text-right">
                      {data.shopTotal > 0 ? (
                        <span className="flex items-center justify-end gap-1">
                          <ShoppingCart className="h-3 w-3 text-muted-foreground" />
                          {formatCurrency(data.shopTotal)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  )}
                  <TableCell className="text-right">
                    {config.needsReconciliation ? formatCurrency(data.combinedTotal) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {config.needsReconciliation && onActualChange ? (
                      <Input
                        type="number"
                        step="0.01"
                        value={actual ?? ""}
                        onChange={(e) => handleInputChange(e.target.value, onActualChange)}
                        disabled={isLocked}
                        className="w-24 text-right ml-auto"
                        placeholder="0.00"
                      />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">TOTAL</TableCell>
              <TableCell className="text-right font-semibold">{formatCurrency(bookingTotal)}</TableCell>
              {hasShopData && (
                <TableCell className="text-right font-semibold">{formatCurrency(shopTotal)}</TableCell>
              )}
              <TableCell className="text-right font-semibold">{formatCurrency(reconcilableTotal)}</TableCell>
              <TableCell className="text-right font-semibold">
                {formatCurrency(actualTotal)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}
