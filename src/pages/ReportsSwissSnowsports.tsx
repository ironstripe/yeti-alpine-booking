import { useMemo, useState } from "react";
import { AlertTriangle, Download } from "lucide-react";

import { PageHeader } from "@/components/layout/PageHeader";
import { DateRangeSelector } from "@/components/reports/DateRangeSelector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { DateRange, getDateRangePresets } from "@/hooks/useReportsData";
import { useSwissSnowsportsReport } from "@/hooks/useSwissSnowsportsReport";
import { downloadCsv, formatCHF } from "@/lib/finance";
import { format } from "date-fns";

export default function ReportsSwissSnowsports() {
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const presets = getDateRangePresets();
    return presets.find((p) => p.label === "Diese Saison")?.getValue() || presets[0].getValue();
  });

  const { data: rows, isLoading } = useSwissSnowsportsReport(dateRange);

  const totals = useMemo(() => {
    return (rows || []).reduce(
      (acc, r) => ({
        lessons: acc.lessons + r.lessons,
        participants: acc.participants + r.participants,
        hours: acc.hours + r.hours,
        revenue: acc.revenue + r.revenue,
      }),
      { lessons: 0, participants: 0, hours: 0, revenue: 0 }
    );
  }, [rows]);

  const unclassified = (rows || []).filter((r) => r.unclassified);

  const handleExport = () => {
    downloadCsv(`swiss-snowsports-${format(new Date(), "yyyy-MM-dd")}.csv`, [
      ["Disziplin", "Zielgruppe", "Kursform", "Lektionen", "Teilnehmer", "Stunden", "Umsatz"],
      ...(rows || []).map((r) => [
        r.discipline,
        r.audience,
        r.category,
        r.lessons,
        r.participants,
        r.hours,
        r.revenue,
      ]),
    ]);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Swiss Snowsports Bericht"
        description="Lektionen, Teilnehmer und Unterrichtsstunden nach Disziplin und Zielgruppe"
      />

      <DateRangeSelector dateRange={dateRange} onDateRangeChange={setDateRange} />

      {unclassified.length > 0 && (
        <Card className="border-amber-500/50">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
            <p>
              Einige Produkte haben keine Statistik-Angaben. Diese Zeilen erscheinen als „Nicht
              klassifiziert“. Ergänze Disziplin, Zielgruppe und Kursform bei den Produkten in den
              Einstellungen, damit der Bericht vollständig ist.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Auswertung</CardTitle>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!rows?.length}>
            <Download className="mr-2 h-4 w-4" />
            CSV
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !rows?.length ? (
            <div className="p-10 text-center text-muted-foreground">
              Keine Daten im gewählten Zeitraum.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Disziplin</TableHead>
                  <TableHead>Zielgruppe</TableHead>
                  <TableHead>Kursform</TableHead>
                  <TableHead className="text-right">Lektionen</TableHead>
                  <TableHead className="text-right">Teilnehmer</TableHead>
                  <TableHead className="text-right">Stunden</TableHead>
                  <TableHead className="text-right">Umsatz</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.key}>
                    <TableCell>
                      {row.discipline}
                      {row.unclassified && (
                        <Badge variant="outline" className="ml-2">
                          unvollständig
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{row.audience}</TableCell>
                    <TableCell>{row.category}</TableCell>
                    <TableCell className="text-right">{row.lessons}</TableCell>
                    <TableCell className="text-right">{row.participants}</TableCell>
                    <TableCell className="text-right">{row.hours}</TableCell>
                    <TableCell className="text-right">{formatCHF(row.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell className="text-right">{totals.lessons}</TableCell>
                  <TableCell className="text-right">{totals.participants}</TableCell>
                  <TableCell className="text-right">{Math.round(totals.hours * 10) / 10}</TableCell>
                  <TableCell className="text-right">{formatCHF(totals.revenue)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
