import { useState } from "react";
import { format } from "date-fns";
import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DateRange } from "@/hooks/useReportsData";
import { toast } from "sonner";

interface ExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportTitle: string;
  dateRange: DateRange;
  onExport: (format: string, options: ExportOptions) => void;
}

export interface ExportOptions {
  format: "csv" | "pdf" | "xlsx";
  includeSummary: boolean;
  includeDetails: boolean;
  includeCharts: boolean;
}

export function ExportModal({ 
  open, 
  onOpenChange, 
  reportTitle, 
  dateRange, 
  onExport 
}: ExportModalProps) {
  const [exportFormat, setExportFormat] = useState<"csv" | "pdf" | "xlsx">("csv");
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeDetails, setIncludeDetails] = useState(true);
  const [includeCharts, setIncludeCharts] = useState(false);

  const handleExport = () => {
    onExport(exportFormat, {
      format: exportFormat,
      includeSummary,
      includeDetails,
      includeCharts,
    });
    toast.success(`${reportTitle} wird als ${exportFormat.toUpperCase()} exportiert...`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bericht exportieren</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label className="text-sm font-medium">Format:</Label>
            <RadioGroup
              value={exportFormat}
              onValueChange={(value) => setExportFormat(value as "csv" | "pdf" | "xlsx")}
              className="space-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="csv" id="csv" />
                <Label htmlFor="csv" className="font-normal">
                  CSV (für Excel)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pdf" id="pdf" />
                <Label htmlFor="pdf" className="font-normal">
                  PDF (druckfertig)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="xlsx" id="xlsx" />
                <Label htmlFor="xlsx" className="font-normal">
                  Excel (.xlsx)
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium">Inhalt:</Label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="summary"
                  checked={includeSummary}
                  onCheckedChange={(checked) => setIncludeSummary(checked as boolean)}
                />
                <Label htmlFor="summary" className="font-normal">
                  Zusammenfassung
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="details"
                  checked={includeDetails}
                  onCheckedChange={(checked) => setIncludeDetails(checked as boolean)}
                />
                <Label htmlFor="details" className="font-normal">
                  Detailtabellen
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="charts"
                  checked={includeCharts}
                  onCheckedChange={(checked) => setIncludeCharts(checked as boolean)}
                  disabled={exportFormat !== "pdf"}
                />
                <Label htmlFor="charts" className={`font-normal ${exportFormat !== "pdf" ? "text-muted-foreground" : ""}`}>
                  Diagramme (nur PDF)
                </Label>
              </div>
            </div>
          </div>

          <div className="text-sm text-muted-foreground">
            Zeitraum: {format(dateRange.start, "dd.MM.yyyy")} - {format(dateRange.end, "dd.MM.yyyy")}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" />
            Exportieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Helper function to generate CSV export
export function generateCSV(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return;

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(";"),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        if (typeof value === "string" && value.includes(";")) {
          return `"${value}"`;
        }
        return value;
      }).join(";")
    )
  ].join("\n");

  const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
}
