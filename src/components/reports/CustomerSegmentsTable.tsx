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
import { CustomerSegment } from "@/hooks/useReportsData";

interface CustomerSegmentsTableProps {
  data: CustomerSegment[] | undefined;
  isLoading: boolean;
}

export function CustomerSegmentsTable({ data, isLoading }: CustomerSegmentsTableProps) {
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
          <CardTitle>Kundensegmente</CardTitle>
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
        <CardTitle>Kundensegmente</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Segment</TableHead>
              <TableHead className="text-right">Kunden</TableHead>
              <TableHead className="text-right">Buchungen</TableHead>
              <TableHead className="text-right">Umsatz</TableHead>
              <TableHead className="text-right">⌀/Kunde</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.map((segment) => (
              <TableRow key={segment.segment}>
                <TableCell className="font-medium">{segment.segment}</TableCell>
                <TableCell className="text-right">{segment.customers}</TableCell>
                <TableCell className="text-right">{segment.bookings}</TableCell>
                <TableCell className="text-right">{formatCurrency(segment.revenue)}</TableCell>
                <TableCell className="text-right">{formatCurrency(segment.avgPerCustomer)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
