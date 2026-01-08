import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, Banknote, CreditCard, Smartphone, FileText } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import type { ShopSale, DayPaymentBreakdown } from "@/hooks/useReconciliation";

const paymentIcons: Record<string, typeof Banknote> = {
  bar: Banknote,
  karte: CreditCard,
  twint: Smartphone,
  rechnung: FileText,
};

const paymentLabels: Record<string, string> = {
  bar: "Bar",
  karte: "Karte",
  twint: "TWINT",
  rechnung: "Rechnung",
};

interface ShopSalesTableProps {
  sales: ShopSale[];
  breakdown: DayPaymentBreakdown[];
  totalRevenue: number;
}

export function ShopSalesTable({ sales, breakdown, totalRevenue }: ShopSalesTableProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  if (sales.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShoppingCart className="h-4 w-4" />
          Shop-Verkäufe
          <Badge variant="secondary" className="ml-2">
            {sales.length} Verkäufe
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Payment breakdown for shop */}
        <div className="flex flex-wrap gap-2">
          {breakdown.map((item) => {
            const Icon = paymentIcons[item.method] || Banknote;
            return (
              <Badge key={item.method} variant="outline" className="flex items-center gap-1">
                <Icon className="h-3 w-3" />
                {paymentLabels[item.method] || item.method}: {formatCurrency(item.total)}
              </Badge>
            );
          })}
        </div>

        {/* Sales list */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Beleg</TableHead>
              <TableHead>Zeit</TableHead>
              <TableHead className="text-right">Artikel</TableHead>
              <TableHead>Zahlung</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.map((sale) => {
              const Icon = paymentIcons[sale.payment_method] || Banknote;
              return (
                <TableRow key={sale.id}>
                  <TableCell className="font-mono text-sm">{sale.transaction_number}</TableCell>
                  <TableCell>{format(new Date(sale.created_at), "HH:mm", { locale: de })}</TableCell>
                  <TableCell className="text-right">{sale.items_count}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Icon className="h-3 w-3 text-muted-foreground" />
                      <span className="text-sm">{paymentLabels[sale.payment_method] || sale.payment_method}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(sale.total)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4} className="font-semibold">Shop-Umsatz</TableCell>
              <TableCell className="text-right font-semibold">{formatCurrency(totalRevenue)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}
