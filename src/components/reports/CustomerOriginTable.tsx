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
import { CustomerOrigin } from "@/hooks/useReportsData";

interface CustomerOriginTableProps {
  data: CustomerOrigin[] | undefined;
  isLoading: boolean;
}

export function CustomerOriginTable({ data, isLoading }: CustomerOriginTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Herkunft der Kunden</CardTitle>
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
        <CardTitle>Herkunft der Kunden</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Land</TableHead>
              <TableHead className="text-right">Kunden</TableHead>
              <TableHead className="text-right">Anteil</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.map((origin) => (
              <TableRow key={origin.country}>
                <TableCell className="font-medium">{origin.country}</TableCell>
                <TableCell className="text-right">{origin.customers}</TableCell>
                <TableCell className="text-right">{origin.share}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
