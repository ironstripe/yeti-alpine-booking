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
import { ProductMix } from "@/hooks/useReportsData";

interface ProductMixTableProps {
  data: ProductMix[] | undefined;
  isLoading: boolean;
}

export function ProductMixTable({ data, isLoading }: ProductMixTableProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Produktmix</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Produktmix</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produkt</TableHead>
              <TableHead className="text-right">Buchungen</TableHead>
              <TableHead className="text-right">Anteil</TableHead>
              <TableHead className="text-right">⌀ Preis</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.map((product) => (
              <TableRow key={product.product}>
                <TableCell className="font-medium">{product.product}</TableCell>
                <TableCell className="text-right">{product.bookings}</TableCell>
                <TableCell className="text-right">{product.share}%</TableCell>
                <TableCell className="text-right">{formatCurrency(product.avgPrice)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
