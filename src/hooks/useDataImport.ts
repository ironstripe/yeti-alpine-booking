// Import orchestrator hook with enhanced conflict handling
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
  category?: "duplicate" | "fk_violation" | "validation" | "unknown";
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
  status: "idle" | "extracting" | "parsing" | "clearing" | "importing" | "complete" | "error";
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

export type ImportMode = "skip" | "update" | "clear";

const IMPORT_ORDER = [
  "products",
  "instructors",
  "customers",
  "customer_participants",
  "tickets",
  "ticket_items",
] as const;

// Tables to clear in reverse FK order
const CLEAR_ORDER = [
  "ticket_items",
  "tickets",
  "customer_participants",
  "customers",
  "instructors",
  "products",
] as const;

// Conflict columns per table
const CONFLICT_COLUMNS: Record<string, string> = {
  products: "id",
  instructors: "id",
  customers: "id",
  customer_participants: "id",
  tickets: "id",
  ticket_items: "id",
};

function categorizeError(message: string): ImportError["category"] {
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes("duplicate") || lowerMessage.includes("unique constraint")) {
    return "duplicate";
  }
  if (lowerMessage.includes("foreign key") || lowerMessage.includes("violates foreign key")) {
    return "fk_violation";
  }
  if (lowerMessage.includes("invalid") || lowerMessage.includes("validation")) {
    return "validation";
  }
  return "unknown";
}

// Helper to get supabase table - use any to bypass strict typing for dynamic table names
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getTable = (tableName: string): any => {
  return supabase.from(tableName as "products");
};

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

  // Clear existing data from all tables
  const clearExistingData = async (): Promise<boolean> => {
    updateProgress({ status: "clearing", message: "Lösche bestehende Daten..." });
    
    for (const tableName of CLEAR_ORDER) {
      updateProgress({ currentTable: tableName, message: `Lösche ${tableName}...` });
      
      const { error } = await getTable(tableName)
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all rows
      
      if (error) {
        console.error(`Error clearing ${tableName}:`, error);
        // Continue even if some deletes fail (might be empty)
      }
    }
    
    return true;
  };

  // Import single row with error handling
  const importSingleRow = async (
    tableName: string,
    row: unknown,
    rowNumber: number,
    mode: ImportMode
  ): Promise<{ success: boolean; error?: ImportError }> => {
    const conflictColumn = CONFLICT_COLUMNS[tableName] || "id";
    
    const { error } = await getTable(tableName)
      .upsert(row, { 
        onConflict: conflictColumn, 
        ignoreDuplicates: mode === "skip"
      });

    if (error) {
      return {
        success: false,
        error: {
          table: tableName,
          rowNumber,
          message: error.message,
          category: categorizeError(error.message),
        },
      };
    }

    return { success: true };
  };

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

  // Main import function with mode support
  const importDataWithMode = async (
    data: ParsedData, 
    mode: ImportMode = "update"
  ): Promise<ImportResult> => {
    const results: TableImportResult[] = [];
    const allErrors: ImportError[] = [];
    const allWarnings: ImportWarning[] = [];
    let totalRecords = 0;
    let totalErrors = 0;

    // Clear existing data if mode is "clear"
    if (mode === "clear") {
      await clearExistingData();
    }

    // Import in FK-respecting order
    for (let tableIndex = 0; tableIndex < IMPORT_ORDER.length; tableIndex++) {
      const tableName = IMPORT_ORDER[tableIndex];
      updateProgress({
        status: "importing",
        currentTable: tableName,
        completedTables: tableIndex,
        message: `Importiere ${tableName}...`,
      });

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
      const tableData = validRows.map((r) => ({ data: r.data, rowNumber: r.rowNumber }));

      // Collect parse warnings/errors
      for (const row of parseResult.rows) {
        for (const err of row.errors) {
          allErrors.push({ 
            table: tableName, 
            rowNumber: row.rowNumber, 
            message: err,
            category: "validation"
          });
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

        const batchData = batch.map(b => b.data);
        const conflictColumn = CONFLICT_COLUMNS[tableName] || "id";

        const { error: batchError, data: insertedData } = await getTable(tableName)
          .upsert(batchData, { 
            onConflict: conflictColumn, 
            ignoreDuplicates: mode === "skip" 
          })
          .select();

        if (batchError) {
          console.error(`Batch error for ${tableName}:`, batchError);
          
          // Fallback: try inserting rows one by one to identify problematic rows
          for (const item of batch) {
            const result = await importSingleRow(tableName, item.data, item.rowNumber, mode);
            if (result.success) {
              inserted++;
            } else if (result.error) {
              allErrors.push(result.error);
              errors++;
            }
          }
        } else {
          inserted += insertedData?.length || batch.length;
        }
      }

      results.push({
        name: tableName,
        inserted,
        skipped: parseResult.rows.length - parseResult.validCount + skipped,
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
  };

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async ({ data, mode }: { data: ParsedData; mode: ImportMode }): Promise<ImportResult> => {
      return importDataWithMode(data, mode);
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

  const importData = useCallback(
    (data: ParsedData, mode: ImportMode = "update") => {
      return importMutation.mutateAsync({ data, mode });
    },
    [importMutation]
  );

  return {
    progress,
    parsedData,
    zipContents,
    extractAndParse,
    importData,
    isImporting: importMutation.isPending,
    importResult: importMutation.data,
    importError: importMutation.error,
    reset,
  };
}
