import { useState } from "react";
import { format, startOfWeek, endOfWeek, startOfDay, endOfDay } from "date-fns";
import { de } from "date-fns/locale";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Calendar } from "lucide-react";
import { useShopTransactions } from "@/hooks/useShopData";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export default function ShopTransactions() {
  const today = new Date();
  const [startDate, setStartDate] = useState<Date>(startOfWeek(today, { locale: de }));
  const [endDate, setEndDate] = useState<Date>(endOfWeek(today, { locale: de }));

  const { data: transactions, isLoading } = useShopTransactions(startDate, endDate);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
    }).format(value);
  };

  const getPaymentMethodLabel = (method: string) => {
    const labels: Record<string, string> = {
      cash: "Bar",
      card: "Karte",
      twint: "TWINT",
      invoice: "Rechnung",
    };
    return labels[method] || method;
  };

  const setToday = () => {
    setStartDate(startOfDay(today));
    setEndDate(endOfDay(today));
  };

  const setThisWeek = () => {
    setStartDate(startOfWeek(today, { locale: de }));
    setEndDate(endOfWeek(today, { locale: de }));
  };

  // Calculate totals
  const totalRevenue = transactions?.reduce((sum, t) => sum + Number(t.total), 0) || 0;
  const salesCount = transactions?.length || 0;
  const avgSale = salesCount > 0 ? totalRevenue / salesCount : 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Verkaufshistorie" description="Alle Shop-Transaktionen" />

      {/* Date Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-[140px] justify-start text-left font-normal")}>
              <Calendar className="mr-2 h-4 w-4" />
              {format(startDate, "dd.MM.yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarComponent
              mode="single"
              selected={startDate}
              onSelect={(date) => date && setStartDate(date)}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        <span className="text-muted-foreground">bis</span>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("w-[140px] justify-start text-left font-normal")}>
              <Calendar className="mr-2 h-4 w-4" />
              {format(endDate, "dd.MM.yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <CalendarComponent
              mode="single"
              selected={endDate}
              onSelect={(date) => date && setEndDate(date)}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        <Button variant="outline" onClick={setToday}>
          Heute
        </Button>
        <Button variant="outline" onClick={setThisWeek}>
          Diese Woche
        </Button>
      </div>

      {/* Transactions Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Datum</TableHead>
                  <TableHead>Beleg-Nr</TableHead>
                  <TableHead>Artikel</TableHead>
                  <TableHead>Zahlung</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions?.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>
                      {format(new Date(transaction.date), "dd.MM. HH:mm", { locale: de })}
                    </TableCell>
                    <TableCell className="font-mono">{transaction.transaction_number}</TableCell>
                    <TableCell>
                      {transaction.shop_transaction_items
                        ?.map((item: any) => `${item.quantity}× ${item.shop_articles?.name || "Artikel"}`)
                        .join(", ") || "–"}
                    </TableCell>
                    <TableCell>{getPaymentMethodLabel(transaction.payment_method)}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(Number(transaction.total))}
                    </TableCell>
                  </TableRow>
                ))}
                {transactions?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Keine Transaktionen im ausgewählten Zeitraum
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Zeitraum-Zusammenfassung</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Verkäufe</p>
              <p className="text-2xl font-bold">{salesCount}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Umsatz</p>
              <p className="text-2xl font-bold">{formatCurrency(totalRevenue)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">⌀ pro Verkauf</p>
              <p className="text-2xl font-bold">{formatCurrency(avgSale)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
