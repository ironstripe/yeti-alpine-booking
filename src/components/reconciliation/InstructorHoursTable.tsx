import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Download } from "lucide-react";
import type { InstructorHours } from "@/hooks/useReconciliation";

interface InstructorHoursTableProps {
  instructorHours: InstructorHours[];
  date: Date;
}

export function InstructorHoursTable({ instructorHours, date }: InstructorHoursTableProps) {
  const formatHours = (hours: number) => `${hours.toFixed(0)}h`;

  const totalBookings = instructorHours.reduce((sum, i) => sum + i.bookings, 0);
  const totalHours = instructorHours.reduce((sum, i) => sum + i.totalHours, 0);
  const totalPrivate = instructorHours.reduce((sum, i) => sum + i.privateHours, 0);
  const totalGroup = instructorHours.reduce((sum, i) => sum + i.groupHours, 0);

  const handleExport = () => {
    const headers = ["Skilehrer", "Buchungen", "Stunden", "Privat", "Gruppe"];
    const rows = instructorHours.map((i) => [
      i.name,
      i.bookings.toString(),
      i.totalHours.toString(),
      i.privateHours.toString(),
      i.groupHours.toString(),
    ]);
    
    // Add totals row
    rows.push(["TOTAL", totalBookings.toString(), totalHours.toString(), totalPrivate.toString(), totalGroup.toString()]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `skilehrer-stunden-${date.toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Skilehrer-Stunden</CardTitle>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Exportieren
        </Button>
      </CardHeader>
      <CardContent>
        {instructorHours.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Keine Skilehrer im Einsatz
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Skilehrer</TableHead>
                <TableHead className="text-right">Buchungen</TableHead>
                <TableHead className="text-right">Stunden</TableHead>
                <TableHead className="text-right">Privat</TableHead>
                <TableHead className="text-right">Gruppe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {instructorHours.map((instructor) => (
                <TableRow key={instructor.id}>
                  <TableCell className="font-medium">{instructor.name}</TableCell>
                  <TableCell className="text-right">{instructor.bookings}</TableCell>
                  <TableCell className="text-right">{formatHours(instructor.totalHours)}</TableCell>
                  <TableCell className="text-right">{formatHours(instructor.privateHours)}</TableCell>
                  <TableCell className="text-right">{formatHours(instructor.groupHours)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">TOTAL</TableCell>
                <TableCell className="text-right font-semibold">{totalBookings}</TableCell>
                <TableCell className="text-right font-semibold">{formatHours(totalHours)}</TableCell>
                <TableCell className="text-right font-semibold">{formatHours(totalPrivate)}</TableCell>
                <TableCell className="text-right font-semibold">{formatHours(totalGroup)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
