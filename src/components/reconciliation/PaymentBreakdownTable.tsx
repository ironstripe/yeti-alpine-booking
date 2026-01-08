import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Banknote, CreditCard, Smartphone, FileText, Ticket } from "lucide-react";
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

  const getExpected = (method: string) => {
    const item = breakdown.find((b) => b.method === method);
    return item?.total || 0;
  };

  const getCount = (method: string) => {
    const item = breakdown.find((b) => b.method === method);
    return item?.count || 0;
  };

  const totalCount = breakdown.reduce((sum, b) => sum + b.count, 0);
  const totalAmount = breakdown.reduce((sum, b) => sum + b.total, 0);
  
  const reconcilableTotal = getExpected("bar") + getExpected("karte") + getExpected("twint");
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

  const allMethods = ["bar", "karte", "twint", "rechnung", "gutschein"];
  const displayMethods = allMethods.filter(
    (m) => getCount(m) > 0 || m === "bar" || m === "karte" || m === "twint"
  );

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
              <TableHead className="text-right">Anzahl</TableHead>
              <TableHead className="text-right">Betrag</TableHead>
              <TableHead className="text-right">Soll</TableHead>
              <TableHead className="text-right">Ist</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayMethods.map((method) => {
              const config = paymentMethodConfig[method] || paymentMethodConfig.other;
              const Icon = config.icon;
              const expected = getExpected(method);
              const count = getCount(method);

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
                  <TableCell className="text-right">{count}</TableCell>
                  <TableCell className="text-right">{formatCurrency(expected)}</TableCell>
                  <TableCell className="text-right">
                    {config.needsReconciliation ? formatCurrency(expected) : "—"}
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
              <TableCell className="text-right font-semibold">{totalCount}</TableCell>
              <TableCell className="text-right font-semibold">{formatCurrency(totalAmount)}</TableCell>
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
