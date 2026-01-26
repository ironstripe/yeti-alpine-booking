import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, AlertTriangle } from "lucide-react";
import type { CSVParseResult } from "@/lib/data-import";

interface ImportTablePreviewProps {
  tableName: string;
  displayName: string;
  parseResult: CSVParseResult<unknown>;
  maxRows?: number;
}

export function ImportTablePreview({
  tableName,
  displayName,
  parseResult,
  maxRows = 5,
}: ImportTablePreviewProps) {
  const { rows, headers, validCount, warningCount, errorCount } = parseResult;

  const getStatusBadge = () => {
    if (errorCount > 0) {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          {errorCount} Fehler
        </Badge>
      );
    }
    if (warningCount > 0) {
      return (
        <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-800">
          <AlertTriangle className="h-3 w-3" />
          {warningCount} Warnungen
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="gap-1 bg-green-100 text-green-800">
        <CheckCircle2 className="h-3 w-3" />
        Gültig
      </Badge>
    );
  };

  const sampleRows = rows.slice(0, maxRows);
  const displayHeaders = headers.slice(0, 6); // Show first 6 columns

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{displayName}</CardTitle>
            <CardDescription>
              {validCount} von {rows.length} Datensätze gültig
            </CardDescription>
          </div>
          {getStatusBadge()}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                {displayHeaders.map((header) => (
                  <TableHead key={header} className="min-w-24">
                    {header}
                  </TableHead>
                ))}
                {headers.length > 6 && (
                  <TableHead className="text-muted-foreground">
                    +{headers.length - 6} mehr
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sampleRows.map((row) => (
                <TableRow
                  key={row.rowNumber}
                  className={
                    row.errors.length > 0
                      ? "bg-destructive/10"
                      : row.warnings.length > 0
                      ? "bg-amber-50"
                      : ""
                  }
                >
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.rowNumber}
                  </TableCell>
                  {displayHeaders.map((header) => (
                    <TableCell key={header} className="font-mono text-xs max-w-32 truncate">
                      {row.originalData[header] || "-"}
                    </TableCell>
                  ))}
                  {headers.length > 6 && <TableCell className="text-muted-foreground">...</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {rows.length > maxRows && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Zeige {maxRows} von {rows.length} Zeilen
          </p>
        )}
      </CardContent>
    </Card>
  );
}
