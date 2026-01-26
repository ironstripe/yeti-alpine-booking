// Import orchestrator hook
import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  extractZipFile,
  validateZipContents,
  parseProductsCSV,
  parseInstructorsCSV,
  parseCustomersCSV,
  parseParticipantsCSV,
  parseTicketsCSV,
  parseTicketItemsCSV,
  type ZipContents,
  type CSVParseResult,
} from "@/lib/data-import";

export interface ImportError {
  table: string;
  rowNumber: number;
  message: string;
}

export interface ImportWarning {
  table: string;
  rowNumber: number;
  message: string;
}

export interface TableImportResult {
  name: string;
  inserted: number;
  skipped: number;
  errors: number;
}

export interface ImportProgress {
  status: "idle" | "extracting" | "parsing" | "importing" | "complete" | "error";
  currentTable: string;
  totalTables: number;
  completedTables: number;
  currentRow: number;
  totalRows: number;
  message: string;
}

export interface ParsedData {
  products: CSVParseResult<unknown>;
  instructors: CSVParseResult<unknown>;
  customers: CSVParseResult<unknown>;
  participants: CSVParseResult<unknown>;
  tickets: CSVParseResult<unknown>;
  ticketItems: CSVParseResult<unknown>;
}

export interface ImportResult {
  success: boolean;
  tables: TableImportResult[];
  totalRecords: number;
  totalErrors: number;
  errors: ImportError[];
  warnings: ImportWarning[];
}

const IMPORT_ORDER = [
  "products",
  "instructors",
  "customers",
  "customer_participants",
  "tickets",
  "ticket_items",
] as const;

export function useDataImport() {
  const [progress, setProgress] = useState<ImportProgress>({
    status: "idle",
    currentTable: "",
    totalTables: 6,
    completedTables: 0,
    currentRow: 0,
    totalRows: 0,
    message: "",
  });

  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [zipContents, setZipContents] = useState<ZipContents | null>(null);

  const updateProgress = useCallback((updates: Partial<ImportProgress>) => {
    setProgress((prev) => ({ ...prev, ...updates }));
  }, []);

  // Extract and parse ZIP file
  const extractAndParse = useCallback(async (file: File): Promise<ParsedData | null> => {
    updateProgress({ status: "extracting", message: "ZIP-Datei wird extrahiert..." });

    const result = await extractZipFile(file);
    if (!result.success || !result.contents) {
      updateProgress({ status: "error", message: result.error || "ZIP-Extraktion fehlgeschlagen" });
      return null;
    }

    const validation = validateZipContents(result.contents);
    if (!validation.valid) {
      updateProgress({
        status: "error",
        message: `Fehlende Dateien: ${validation.missing.join(", ")}`,
      });
      return null;
    }

    setZipContents(result.contents);
    updateProgress({ status: "parsing", message: "CSV-Dateien werden geparst..." });

    const files = result.contents.files;

    const parsed: ParsedData = {
      products: parseProductsCSV(files.get("products.csv") || ""),
      instructors: parseInstructorsCSV(files.get("instructors.csv") || ""),
      customers: parseCustomersCSV(files.get("customers.csv") || ""),
      participants: parseParticipantsCSV(files.get("customer_participants.csv") || ""),
      tickets: parseTicketsCSV(files.get("tickets.csv") || ""),
      ticketItems: parseTicketItemsCSV(files.get("ticket_items.csv") || ""),
    };

    setParsedData(parsed);
    updateProgress({ status: "idle", message: "Daten bereit zum Import" });

    return parsed;
  }, [updateProgress]);

  // Import data to Supabase
  const importMutation = useMutation({
    mutationFn: async (data: ParsedData): Promise<ImportResult> => {
      const results: TableImportResult[] = [];
      const allErrors: ImportError[] = [];
      const allWarnings: ImportWarning[] = [];
      let totalRecords = 0;
      let totalErrors = 0;

      // Import in FK-respecting order
      for (let tableIndex = 0; tableIndex < IMPORT_ORDER.length; tableIndex++) {
        const tableName = IMPORT_ORDER[tableIndex];
        updateProgress({
          status: "importing",
          currentTable: tableName,
          completedTables: tableIndex,
          message: `Importiere ${tableName}...`,
        });

        let tableData: unknown[];
        let parseResult: CSVParseResult<unknown>;

        switch (tableName) {
          case "products":
            parseResult = data.products;
            break;
          case "instructors":
            parseResult = data.instructors;
            break;
          case "customers":
            parseResult = data.customers;
            break;
          case "customer_participants":
            parseResult = data.participants;
            break;
          case "tickets":
            parseResult = data.tickets;
            break;
          case "ticket_items":
            parseResult = data.ticketItems;
            break;
          default:
            continue;
        }

        // Get valid rows only
        const validRows = parseResult.rows.filter((r) => r.isValid);
        tableData = validRows.map((r) => r.data);

        // Collect parse warnings/errors
        for (const row of parseResult.rows) {
          for (const err of row.errors) {
            allErrors.push({ table: tableName, rowNumber: row.rowNumber, message: err });
          }
          for (const warn of row.warnings) {
            allWarnings.push({ table: tableName, rowNumber: row.rowNumber, message: warn });
          }
        }

        if (tableData.length === 0) {
          results.push({
            name: tableName,
            inserted: 0,
            skipped: parseResult.rows.length,
            errors: parseResult.errorCount,
          });
          totalErrors += parseResult.errorCount;
          continue;
        }

        updateProgress({
          totalRows: tableData.length,
          currentRow: 0,
        });

        // Batch insert in chunks of 100
        const BATCH_SIZE = 100;
        let inserted = 0;
        let skipped = 0;
        let errors = 0;

        for (let i = 0; i < tableData.length; i += BATCH_SIZE) {
          const batch = tableData.slice(i, i + BATCH_SIZE);
          updateProgress({ currentRow: i });

          const { error, count } = await supabase
            .from(tableName)
            .upsert(batch as never[], { onConflict: "id", ignoreDuplicates: false })
            .select();

          if (error) {
            console.error(`Error inserting into ${tableName}:`, error);
            allErrors.push({
              table: tableName,
              rowNumber: i + 2,
              message: error.message,
            });
            errors += batch.length;
          } else {
            inserted += batch.length;
          }
        }

        results.push({
          name: tableName,
          inserted,
          skipped: parseResult.rows.length - parseResult.validCount,
          errors: parseResult.errorCount + errors,
        });

        totalRecords += inserted;
        totalErrors += parseResult.errorCount + errors;
      }

      updateProgress({
        status: "complete",
        completedTables: IMPORT_ORDER.length,
        message: `Import abgeschlossen: ${totalRecords} Datensätze`,
      });

      return {
        success: totalErrors === 0,
        tables: results,
        totalRecords,
        totalErrors,
        errors: allErrors,
        warnings: allWarnings,
      };
    },
  });

  const reset = useCallback(() => {
    setProgress({
      status: "idle",
      currentTable: "",
      totalTables: 6,
      completedTables: 0,
      currentRow: 0,
      totalRows: 0,
      message: "",
    });
    setParsedData(null);
    setZipContents(null);
  }, []);

  return {
    progress,
    parsedData,
    zipContents,
    extractAndParse,
    importData: importMutation.mutateAsync,
    isImporting: importMutation.isPending,
    importResult: importMutation.data,
    importError: importMutation.error,
    reset,
  };
}
