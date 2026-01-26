import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, XCircle, AlertTriangle, FileText, Database } from "lucide-react";
import type { ImportResult, ImportError, ImportWarning } from "@/hooks/useDataImport";

interface ImportReportProps {
  result: ImportResult;
}

export function ImportReport({ result }: ImportReportProps) {
  const { success, tables, totalRecords, totalErrors, errors, warnings } = result;

  const getStatusIcon = () => {
    if (totalErrors === 0) {
      return <CheckCircle2 className="h-8 w-8 text-green-600" />;
    }
    if (totalRecords > 0) {
      return <AlertTriangle className="h-8 w-8 text-amber-600" />;
    }
    return <XCircle className="h-8 w-8 text-destructive" />;
  };

  const getStatusText = () => {
    if (totalErrors === 0) return "Import erfolgreich";
    if (totalRecords > 0) return "Import teilweise erfolgreich";
    return "Import fehlgeschlagen";
  };

  const getStatusBadge = () => {
    if (totalErrors === 0) {
      return <Badge className="bg-green-100 text-green-800">Erfolgreich</Badge>;
    }
    if (totalRecords > 0) {
      return <Badge className="bg-amber-100 text-amber-800">Teilweise</Badge>;
    }
    return <Badge variant="destructive">Fehlgeschlagen</Badge>;
  };

  const tableNames: Record<string, string> = {
    products: "Produkte",
    instructors: "Instruktoren",
    customers: "Kunden",
    customer_participants: "Teilnehmer",
    tickets: "Buchungen",
    ticket_items: "Lektionen",
  };

  return (
    <div className="space-y-6">
      {/* Summary Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            {getStatusIcon()}
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                {getStatusText()}
                {getStatusBadge()}
              </CardTitle>
              <CardDescription className="mt-1">
                {totalRecords} Datensätze importiert
                {totalErrors > 0 && `, ${totalErrors} Fehler`}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Per-Table Results */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-4 w-4" />
            Import-Details nach Tabelle
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {tables.map((table) => (
              <div
                key={table.name}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      table.errors > 0
                        ? "bg-destructive"
                        : table.skipped > 0
                        ? "bg-amber-500"
                        : "bg-green-500"
                    }`}
                  />
                  <span className="font-medium">{tableNames[table.name] || table.name}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-green-600">{table.inserted} eingefügt</span>
                  {table.skipped > 0 && (
                    <span className="text-amber-600">{table.skipped} übersprungen</span>
                  )}
                  {table.errors > 0 && (
                    <span className="text-destructive">{table.errors} Fehler</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Errors */}
      {errors.length > 0 && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <XCircle className="h-4 w-4" />
              Fehler ({errors.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-48">
              <div className="space-y-2">
                {errors.slice(0, 50).map((error, idx) => (
                  <div
                    key={idx}
                    className="text-sm p-2 bg-destructive/10 rounded border border-destructive/20"
                  >
                    <span className="font-medium">
                      {tableNames[error.table] || error.table} (Zeile {error.rowNumber}):
                    </span>{" "}
                    {error.message}
                  </div>
                ))}
                {errors.length > 50 && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    +{errors.length - 50} weitere Fehler
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <Card className="border-amber-500/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
              Warnungen ({warnings.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-32">
              <div className="space-y-2">
                {warnings.slice(0, 20).map((warning, idx) => (
                  <div
                    key={idx}
                    className="text-sm p-2 bg-amber-50 rounded border border-amber-200"
                  >
                    <span className="font-medium">
                      {tableNames[warning.table] || warning.table} (Zeile {warning.rowNumber}):
                    </span>{" "}
                    {warning.message}
                  </div>
                ))}
                {warnings.length > 20 && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    +{warnings.length - 20} weitere Warnungen
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Next Steps */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Nächste Schritte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>• Überprüfen Sie die importierten Daten in den jeweiligen Bereichen</li>
            <li>• Kunden: {tables.find((t) => t.name === "customers")?.inserted || 0} neue Einträge</li>
            <li>• Buchungen: {tables.find((t) => t.name === "tickets")?.inserted || 0} neue Einträge</li>
            {totalErrors > 0 && (
              <li className="text-destructive">
                • Beheben Sie die {totalErrors} Fehler und importieren Sie erneut
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
