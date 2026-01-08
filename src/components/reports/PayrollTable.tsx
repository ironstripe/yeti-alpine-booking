import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Download } from "lucide-react";
import { InstructorStats } from "@/hooks/useReportsData";
import { generateCSV } from "./ExportModal";
import { toast } from "sonner";

interface PayrollTableProps {
  data: InstructorStats[] | undefined;
  isLoading: boolean;
  periodLabel: string;
}

export function PayrollTable({ data, isLoading, periodLabel }: PayrollTableProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency: "CHF",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const handleExport = () => {
    if (!data) return;
    
    const exportData = data.map(i => ({
      Skilehrer: i.name,
      "Privatstunden": i.privateHours,
      "Gruppenstunden": i.groupHours,
      "Total Stunden": i.totalHours,
      "Stundensatz": i.hourlyRate,
      "Betrag": i.totalPay,
    }));

    generateCSV(exportData, `lohnabrechnung-${periodLabel.replace(/\s/g, "-")}`);
    toast.success("Lohnabrechnung exportiert");
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Lohnabrechnung {periodLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const totalHours = data?.reduce((sum, i) => sum + i.totalHours, 0) || 0;
  const totalPrivate = data?.reduce((sum, i) => sum + i.privateHours, 0) || 0;
  const totalGroup = data?.reduce((sum, i) => sum + i.groupHours, 0) || 0;
  const totalPay = data?.reduce((sum, i) => sum + i.totalPay, 0) || 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Lohnabrechnung {periodLabel}</span>
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" />
            Exportieren
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Skilehrer</TableHead>
              <TableHead className="text-right">Privat</TableHead>
              <TableHead className="text-right">Gruppe</TableHead>
              <TableHead className="text-right">Total h</TableHead>
              <TableHead className="text-right">Stundensatz</TableHead>
              <TableHead className="text-right">Betrag</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.map((instructor) => (
              <TableRow key={instructor.id}>
                <TableCell>{instructor.name}</TableCell>
                <TableCell className="text-right">{instructor.privateHours}h</TableCell>
                <TableCell className="text-right">{instructor.groupHours}h</TableCell>
                <TableCell className="text-right font-medium">{instructor.totalHours}h</TableCell>
                <TableCell className="text-right">{formatCurrency(instructor.hourlyRate)}/h</TableCell>
                <TableCell className="text-right font-medium">{formatCurrency(instructor.totalPay)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="font-bold border-t-2">
              <TableCell>TOTAL</TableCell>
              <TableCell className="text-right">{totalPrivate}h</TableCell>
              <TableCell className="text-right">{totalGroup}h</TableCell>
              <TableCell className="text-right">{totalHours}h</TableCell>
              <TableCell></TableCell>
              <TableCell className="text-right">{formatCurrency(totalPay)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
