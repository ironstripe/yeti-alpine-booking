import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
  Download,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  parseInstructorCSV,
  getValidInstructorRecords,
  type CSVParseResult,
  type ParsedInstructorRow,
} from "@/lib/csv-parser";
import { useBulkCreateInstructors, type BulkCreateResult } from "@/hooks/useBulkCreateInstructors";
import { useToast } from "@/hooks/use-toast";

interface BulkUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "upload" | "preview" | "importing" | "result";

export function BulkUploadModal({ open, onOpenChange }: BulkUploadModalProps) {
  const [step, setStep] = useState<Step>("upload");
  const [parseResult, setParseResult] = useState<CSVParseResult | null>(null);
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [importResult, setImportResult] = useState<BulkCreateResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const { mutateAsync: bulkCreate, isPending } = useBulkCreateInstructors();
  const { toast } = useToast();

  const resetState = useCallback(() => {
    setStep("upload");
    setParseResult(null);
    setSelectedRows(new Set());
    setImportResult(null);
  }, []);

  const handleClose = (open: boolean) => {
    if (!open) {
      resetState();
    }
    onOpenChange(open);
  };

  const handleFileSelect = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const result = parseInstructorCSV(content);
      setParseResult(result);

      // Pre-select all valid rows
      const validRowNumbers = new Set(
        result.rows.filter((r) => r.errors.length === 0).map((r) => r.rowNumber)
      );
      setSelectedRows(validRowNumbers);
      setStep("preview");
    };
    reader.readAsText(file, "UTF-8");
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file && (file.name.endsWith(".csv") || file.type === "text/csv")) {
        handleFileSelect(file);
      } else {
        toast({
          title: "Ungültiges Format",
          description: "Bitte laden Sie eine CSV-Datei hoch.",
          variant: "destructive",
        });
      }
    },
    [handleFileSelect, toast]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const toggleRowSelection = (rowNumber: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) {
        next.delete(rowNumber);
      } else {
        next.add(rowNumber);
      }
      return next;
    });
  };

  const handleImport = async () => {
    if (!parseResult) return;

    const rowsToImport = parseResult.rows.filter(
      (r) => selectedRows.has(r.rowNumber) && r.errors.length === 0
    );
    const records = rowsToImport.map((r) => r.data) as Parameters<typeof bulkCreate>[0];

    setStep("importing");

    try {
      const result = await bulkCreate(records);
      setImportResult(result);
      setStep("result");

      if (result.success > 0) {
        toast({
          title: "Import erfolgreich",
          description: `${result.success} Skilehrer wurden importiert.`,
        });
      }
    } catch (error) {
      toast({
        title: "Import fehlgeschlagen",
        description: "Ein unerwarteter Fehler ist aufgetreten.",
        variant: "destructive",
      });
      setStep("preview");
    }
  };

  const downloadTemplate = () => {
    const headers = [
      "Name",
      "Vorname",
      "Geburtsdatum",
      "Email",
      "Telefon",
      "Adresse",
      "PLZ",
      "Ort",
      "Land",
      "AHV_PEID",
      "Lohn_aktuell",
      "IBAN",
      "Sprachen",
    ];
    const example = [
      "Muster",
      "Max",
      "01.01.1990",
      "max.muster@example.com",
      "+41791234567",
      "Musterstrasse 1",
      "9497",
      "Triesenberg",
      "Liechtenstein",
      "756.1234.5678.90",
      "30.50",
      "LI1234567890123456789",
      "DE,EN",
    ];

    const csv = [headers.join(";"), example.join(";")].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "skilehrer_vorlage.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedValidCount = parseResult
    ? parseResult.rows.filter(
        (r) => selectedRows.has(r.rowNumber) && r.errors.length === 0
      ).length
    : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {step === "upload" && "Skilehrer importieren"}
            {step === "preview" && "Daten prüfen"}
            {step === "importing" && "Import läuft..."}
            {step === "result" && "Import abgeschlossen"}
          </DialogTitle>
          <DialogDescription>
            {step === "upload" &&
              "Laden Sie eine CSV-Datei mit Skilehrerdaten hoch."}
            {step === "preview" &&
              "Überprüfen Sie die Daten und wählen Sie die zu importierenden Zeilen aus."}
            {step === "importing" && "Bitte warten Sie..."}
            {step === "result" && "Übersicht der importierten Daten."}
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="flex-1 flex flex-col gap-4">
            <div
              className={cn(
                "flex-1 min-h-[200px] border-2 border-dashed rounded-lg flex flex-col items-center justify-center gap-4 transition-colors cursor-pointer",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-muted-foreground/50"
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById("csv-input")?.click()}
            >
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                <Upload className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="font-medium">
                  CSV-Datei hierher ziehen oder klicken
                </p>
                <p className="text-sm text-muted-foreground">
                  Unterstützt: .csv mit Semikolon-Trennung
                </p>
              </div>
              <input
                id="csv-input"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileInputChange}
              />
            </div>

            <div className="flex justify-between items-center">
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Vorlage herunterladen
              </Button>
              <Button variant="ghost" onClick={() => handleClose(false)}>
                Abbrechen
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && parseResult && (
          <div className="flex-1 flex flex-col gap-4 min-h-0">
            {/* Summary badges */}
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="gap-1">
                <FileSpreadsheet className="h-3 w-3" />
                {parseResult.rows.length} Zeilen
              </Badge>
              <Badge
                variant="outline"
                className="gap-1 bg-green-50 text-green-700 border-green-200"
              >
                <CheckCircle2 className="h-3 w-3" />
                {parseResult.validCount - parseResult.warningCount} Gültig
              </Badge>
              {parseResult.warningCount > 0 && (
                <Badge
                  variant="outline"
                  className="gap-1 bg-yellow-50 text-yellow-700 border-yellow-200"
                >
                  <AlertTriangle className="h-3 w-3" />
                  {parseResult.warningCount} Warnungen
                </Badge>
              )}
              {parseResult.errorCount > 0 && (
                <Badge
                  variant="outline"
                  className="gap-1 bg-red-50 text-red-700 border-red-200"
                >
                  <AlertCircle className="h-3 w-3" />
                  {parseResult.errorCount} Fehler
                </Badge>
              )}
            </div>

            {/* Data table */}
            <ScrollArea className="flex-1 border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="p-2 text-left w-10">
                      <Checkbox
                        checked={
                          selectedRows.size ===
                          parseResult.rows.filter((r) => r.errors.length === 0)
                            .length
                        }
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedRows(
                              new Set(
                                parseResult.rows
                                  .filter((r) => r.errors.length === 0)
                                  .map((r) => r.rowNumber)
                              )
                            );
                          } else {
                            setSelectedRows(new Set());
                          }
                        }}
                      />
                    </th>
                    <th className="p-2 text-left w-12">#</th>
                    <th className="p-2 text-left">Name</th>
                    <th className="p-2 text-left">E-Mail</th>
                    <th className="p-2 text-left">Telefon</th>
                    <th className="p-2 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parseResult.rows.map((row) => (
                    <PreviewRow
                      key={row.rowNumber}
                      row={row}
                      isSelected={selectedRows.has(row.rowNumber)}
                      onToggle={() => toggleRowSelection(row.rowNumber)}
                    />
                  ))}
                </tbody>
              </table>
            </ScrollArea>

            {/* Actions */}
            <div className="flex justify-between items-center">
              <Button variant="ghost" onClick={resetState}>
                Zurück
              </Button>
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {selectedValidCount} ausgewählt
                </span>
                <Button
                  onClick={handleImport}
                  disabled={selectedValidCount === 0}
                >
                  {selectedValidCount} Skilehrer importieren
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground">Daten werden importiert...</p>
            <Progress value={50} className="w-64" />
          </div>
        )}

        {step === "result" && importResult && (
          <div className="flex-1 flex flex-col gap-6 py-4">
            <div className="flex flex-col items-center gap-4 py-8">
              {importResult.success > 0 ? (
                <CheckCircle2 className="h-16 w-16 text-green-500" />
              ) : (
                <AlertCircle className="h-16 w-16 text-red-500" />
              )}
              <div className="text-center">
                <p className="text-2xl font-semibold">
                  {importResult.success} erfolgreich importiert
                </p>
                {importResult.failed > 0 && (
                  <p className="text-muted-foreground">
                    {importResult.failed} fehlgeschlagen
                  </p>
                )}
              </div>
            </div>

            {importResult.errors.length > 0 && (
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  Fehlerdetails
                </h4>
                <ScrollArea className="max-h-40">
                  <ul className="text-sm space-y-1">
                    {importResult.errors.map((err, i) => (
                      <li key={i} className="text-muted-foreground">
                        Zeile {err.row} ({err.email}): {err.error}
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={() => handleClose(false)}>Schliessen</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PreviewRow({
  row,
  isSelected,
  onToggle,
}: {
  row: ParsedInstructorRow;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const hasErrors = row.errors.length > 0;
  const hasWarnings = row.warnings.length > 0;

  return (
    <tr
      className={cn(
        "border-b hover:bg-muted/30",
        hasErrors && "bg-red-50",
        hasWarnings && !hasErrors && "bg-yellow-50"
      )}
    >
      <td className="p-2">
        <Checkbox
          checked={isSelected}
          disabled={hasErrors}
          onCheckedChange={onToggle}
        />
      </td>
      <td className="p-2 text-muted-foreground">{row.rowNumber}</td>
      <td className="p-2 font-medium">
        {row.data.first_name} {row.data.last_name}
      </td>
      <td className="p-2">{row.data.email || "-"}</td>
      <td className="p-2">{row.data.phone || "-"}</td>
      <td className="p-2">
        {hasErrors ? (
          <div className="flex items-center gap-1 text-red-600">
            <X className="h-3 w-3" />
            <span className="text-xs">{row.errors.join(", ")}</span>
          </div>
        ) : hasWarnings ? (
          <div className="flex items-center gap-1 text-yellow-600">
            <AlertTriangle className="h-3 w-3" />
            <span className="text-xs">{row.warnings.join(", ")}</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-green-600">
            <CheckCircle2 className="h-3 w-3" />
            <span className="text-xs">Gültig</span>
          </div>
        )}
      </td>
    </tr>
  );
}
