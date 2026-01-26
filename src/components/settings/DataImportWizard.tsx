import { useState, useCallback } from "react";
import { Upload, FileArchive, CheckCircle2, Loader2, AlertTriangle, Trash2, RefreshCw, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useDataImport, type ParsedData, type ImportMode } from "@/hooks/useDataImport";
import { ImportTablePreview } from "./ImportTablePreview";
import { ImportReport } from "./ImportReport";
import { cn } from "@/lib/utils";

type WizardStep = "upload" | "preview" | "importing" | "complete";

export function DataImportWizard() {
  const [step, setStep] = useState<WizardStep>("upload");
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("clear");

  const {
    progress,
    parsedData,
    extractAndParse,
    importData,
    isImporting,
    importResult,
    reset,
  } = useDataImport();

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        if (file.name.endsWith(".zip")) {
          setSelectedFile(file);
          const result = await extractAndParse(file);
          if (result) {
            setStep("preview");
          }
        }
      }
    },
    [extractAndParse]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        setSelectedFile(file);
        const result = await extractAndParse(file);
        if (result) {
          setStep("preview");
        }
      }
    },
    [extractAndParse]
  );

  const handleStartImport = useCallback(async () => {
    if (!parsedData) return;
    setStep("importing");
    await importData(parsedData, importMode);
    setStep("complete");
  }, [parsedData, importData, importMode]);

  const handleReset = useCallback(() => {
    reset();
    setStep("upload");
    setSelectedFile(null);
    setImportMode("clear");
  }, [reset]);

  const getTotalRecords = (data: ParsedData) => {
    return (
      data.products.rows.length +
      data.instructors.rows.length +
      data.customers.rows.length +
      data.participants.rows.length +
      data.tickets.rows.length +
      data.ticketItems.rows.length
    );
  };

  const getTotalErrors = (data: ParsedData) => {
    return (
      data.products.errorCount +
      data.instructors.errorCount +
      data.customers.errorCount +
      data.participants.errorCount +
      data.tickets.errorCount +
      data.ticketItems.errorCount
    );
  };

  // Step 1: Upload
  if (step === "upload") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileArchive className="h-5 w-5" />
            ZIP-Datei hochladen
          </CardTitle>
          <CardDescription>
            Laden Sie die Testdaten-ZIP-Datei hoch. Diese enthält 6 CSV-Dateien mit
            Kunden, Teilnehmern, Instruktoren, Produkten und Buchungen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-12 text-center transition-colors",
              dragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50"
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {progress.status === "extracting" || progress.status === "parsing" ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="h-12 w-12 text-primary animate-spin" />
                <div>
                  <p className="font-medium">{progress.message}</p>
                  <p className="text-sm text-muted-foreground">{selectedFile?.name}</p>
                </div>
              </div>
            ) : progress.status === "error" ? (
              <div className="flex flex-col items-center gap-4">
                <AlertTriangle className="h-12 w-12 text-destructive" />
                <div>
                  <p className="font-medium text-destructive">Fehler</p>
                  <p className="text-sm text-muted-foreground">{progress.message}</p>
                </div>
                <Button variant="outline" onClick={handleReset}>
                  Erneut versuchen
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <Upload className="h-12 w-12 text-muted-foreground" />
                <div>
                  <p className="font-medium">ZIP-Datei hierher ziehen</p>
                  <p className="text-sm text-muted-foreground">oder klicken zum Auswählen</p>
                </div>
                <input
                  type="file"
                  accept=".zip"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="zip-upload"
                />
                <Button asChild variant="outline">
                  <label htmlFor="zip-upload" className="cursor-pointer">
                    Datei auswählen
                  </label>
                </Button>
              </div>
            )}
          </div>

          <div className="mt-6 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2">Erwartete Dateien:</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• products.csv - Produkte (6 Einträge)</li>
              <li>• instructors.csv - Instruktoren (26 Einträge)</li>
              <li>• customers.csv - Kunden (557 Einträge)</li>
              <li>• customer_participants.csv - Teilnehmer (245 Einträge)</li>
              <li>• tickets.csv - Buchungen (315 Einträge)</li>
              <li>• ticket_items.csv - Lektionen (317 Einträge)</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Step 2: Preview
  if (step === "preview" && parsedData) {
    const totalRecords = getTotalRecords(parsedData);
    const totalErrors = getTotalErrors(parsedData);

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Daten geparst
                </CardTitle>
                <CardDescription>
                  {totalRecords} Datensätze gefunden
                  {totalErrors > 0 && `, ${totalErrors} mit Fehlern`}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleReset}>
                  Abbrechen
                </Button>
                <Button onClick={handleStartImport}>
                  Import starten
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-3">Import-Modus</h4>
                <RadioGroup
                  value={importMode}
                  onValueChange={(value) => setImportMode(value as ImportMode)}
                  className="space-y-3"
                >
                  <div className="flex items-start space-x-3">
                    <RadioGroupItem value="clear" id="mode-clear" />
                    <div className="space-y-1">
                      <Label htmlFor="mode-clear" className="flex items-center gap-2 font-medium cursor-pointer">
                        <Trash2 className="h-4 w-4 text-destructive" />
                        Bestehende Daten löschen (empfohlen für Testdaten)
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Löscht alle bestehenden Daten in den Import-Tabellen vor dem Import.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <RadioGroupItem value="update" id="mode-update" />
                    <div className="space-y-1">
                      <Label htmlFor="mode-update" className="flex items-center gap-2 font-medium cursor-pointer">
                        <RefreshCw className="h-4 w-4 text-primary" />
                        Bestehende aktualisieren
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Aktualisiert bestehende Datensätze mit CSV-Daten, fügt neue hinzu.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <RadioGroupItem value="skip" id="mode-skip" />
                    <div className="space-y-1">
                      <Label htmlFor="mode-skip" className="flex items-center gap-2 font-medium cursor-pointer">
                        <SkipForward className="h-4 w-4 text-amber-600" />
                        Duplikate überspringen
                      </Label>
                      <p className="text-sm text-muted-foreground">
                        Bestehende Datensätze bleiben unverändert, nur neue werden hinzugefügt.
                      </p>
                    </div>
                  </div>
                </RadioGroup>
              </div>

              {importMode === "clear" && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Achtung:</strong> Alle bestehenden Daten in den Import-Tabellen werden gelöscht!
                    Dies kann nicht rückgängig gemacht werden.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <ImportTablePreview
            tableName="products"
            displayName="Produkte"
            parseResult={parsedData.products}
          />
          <ImportTablePreview
            tableName="instructors"
            displayName="Instruktoren"
            parseResult={parsedData.instructors}
          />
          <ImportTablePreview
            tableName="customers"
            displayName="Kunden"
            parseResult={parsedData.customers}
          />
          <ImportTablePreview
            tableName="customer_participants"
            displayName="Teilnehmer"
            parseResult={parsedData.participants}
          />
          <ImportTablePreview
            tableName="tickets"
            displayName="Buchungen"
            parseResult={parsedData.tickets}
          />
          <ImportTablePreview
            tableName="ticket_items"
            displayName="Lektionen"
            parseResult={parsedData.ticketItems}
          />
        </div>
      </div>
    );
  }

  // Step 3: Importing
  if (step === "importing") {
    const progressPercent = (progress.completedTables / progress.totalTables) * 100;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Import läuft...
          </CardTitle>
          <CardDescription>{progress.message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={progressPercent} className="h-2" />
          <p className="text-sm text-muted-foreground text-center">
            Tabelle {progress.completedTables + 1} von {progress.totalTables}:{" "}
            <span className="font-medium">{progress.currentTable}</span>
          </p>
          {progress.totalRows > 0 && (
            <p className="text-xs text-muted-foreground text-center">
              Zeile {progress.currentRow} von {progress.totalRows}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  // Step 4: Complete
  if (step === "complete" && importResult) {
    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <Button onClick={handleReset}>Neuer Import</Button>
        </div>
        <ImportReport result={importResult} />
      </div>
    );
  }

  return null;
}
