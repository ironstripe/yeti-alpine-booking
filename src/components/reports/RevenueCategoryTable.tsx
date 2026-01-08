import { TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { RevenueByCategory } from "@/hooks/useReportsData";

interface RevenueCategoryTableProps {
  data: RevenueByCategory[] | undefined;
  isLoading: boolean;
}

export function RevenueCategoryTable({ data, isLoading }: RevenueCategoryTableProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const totalRevenue = data?.reduce((sum, d) => sum + d.revenue, 0) || 0;
  const totalCount = data?.reduce((sum, d) => sum + d.count, 0) || 0;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Umsatz nach Kategorie</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Umsatz nach Kategorie</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kategorie</TableHead>
              <TableHead className="text-right">Anzahl</TableHead>
              <TableHead className="text-right">Umsatz</TableHead>
              <TableHead className="text-right">Anteil</TableHead>
              <TableHead className="text-right">Trend</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.map((category) => (
              <TableRow key={category.category}>
                <TableCell className="font-medium">{category.category}</TableCell>
                <TableCell className="text-right">{category.count}</TableCell>
                <TableCell className="text-right">{formatCurrency(category.revenue)}</TableCell>
                <TableCell className="text-right">
                  {totalRevenue > 0 ? Math.round((category.revenue / totalRevenue) * 100) : 0}%
                </TableCell>
                <TableCell className="text-right">
                  <span className={`flex items-center justify-end gap-1 ${(category.trend || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {(category.trend || 0) >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {(category.trend || 0) >= 0 ? "↑" : "↓"}{Math.abs(category.trend || 0)}%
                  </span>
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="font-bold border-t-2">
              <TableCell>TOTAL</TableCell>
              <TableCell className="text-right">{totalCount}</TableCell>
              <TableCell className="text-right">{formatCurrency(totalRevenue)}</TableCell>
              <TableCell className="text-right">100%</TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
