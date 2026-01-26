// Generic CSV Parser for data import
import { cleanString, parseNumber, parseBoolean } from "./validation";

export interface CSVParseOptions {
  delimiter?: "," | ";";
  hasHeader?: boolean;
}

export interface ParsedRow<T> {
  rowNumber: number;
  data: Partial<T>;
  warnings: string[];
  errors: string[];
  isValid: boolean;
  originalData: Record<string, string>;
}

export interface CSVParseResult<T> {
  rows: ParsedRow<T>[];
  headers: string[];
  validCount: number;
  warningCount: number;
  errorCount: number;
}

/**
 * Parse CSV content into 2D array, handling quoted values
 */
export function parseCSVContent(content: string, delimiter: "," | ";" = ","): string[][] {
  // Remove BOM if present (common in Excel-exported CSVs)
  let cleanContent = content;
  if (content.charCodeAt(0) === 0xfeff) {
    cleanContent = content.slice(1);
  }

  const lines = cleanContent.split(/\r?\n/).filter((line) => line.trim());

  return lines.map((line) => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        // Handle escaped quotes (two consecutive quotes)
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        values.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    return values;
  });
}

/**
 * Detect delimiter by analyzing first few lines
 */
export function detectDelimiter(content: string): "," | ";" {
  const firstLine = content.split(/\r?\n/)[0] || "";
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  return semicolonCount > commaCount ? ";" : ",";
}

/**
 * Create column mapping from headers
 */
export function createColumnMapping(
  csvHeaders: string[],
  dbFields: string[]
): Map<string, string> {
  const mapping = new Map<string, string>();
  const normalizedDbFields = dbFields.map((f) => f.toLowerCase());

  for (const header of csvHeaders) {
    const normalizedHeader = header.toLowerCase().trim();

    // Direct match
    const directIndex = normalizedDbFields.indexOf(normalizedHeader);
    if (directIndex >= 0) {
      mapping.set(header, dbFields[directIndex]);
      continue;
    }

    // Try removing underscores and matching
    const noUnderscore = normalizedHeader.replace(/_/g, "");
    for (let i = 0; i < normalizedDbFields.length; i++) {
      if (normalizedDbFields[i].replace(/_/g, "") === noUnderscore) {
        mapping.set(header, dbFields[i]);
        break;
      }
    }
  }

  return mapping;
}

/**
 * Parse a generic CSV with type mapping
 */
export function parseGenericCSV<T>(
  content: string,
  fieldMapping: Record<string, keyof T>,
  options: CSVParseOptions = {}
): CSVParseResult<T> {
  const delimiter = options.delimiter || detectDelimiter(content);
  const rows = parseCSVContent(content, delimiter);

  if (rows.length < 2) {
    return {
      rows: [],
      headers: [],
      validCount: 0,
      warningCount: 0,
      errorCount: 1,
    };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);

  const parsedRows: ParsedRow<T>[] = [];
  let validCount = 0;
  let warningCount = 0;
  let errorCount = 0;

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNumber = i + 2; // +2 for 1-based index and header row
    const warnings: string[] = [];
    const errors: string[] = [];
    const originalData: Record<string, string> = {};
    const data: Partial<T> = {};

    // Map each column
    headers.forEach((header, colIndex) => {
      const value = row[colIndex]?.trim() || "";
      originalData[header] = value;

      const dbField = fieldMapping[header.toLowerCase()];
      if (dbField) {
        // Store as-is, type conversion happens in table-specific parsers
        (data as Record<string, unknown>)[dbField as string] = cleanString(value);
      }
    });

    const isValid = errors.length === 0;
    if (errors.length > 0) {
      errorCount++;
    } else if (warnings.length > 0) {
      warningCount++;
      validCount++;
    } else {
      validCount++;
    }

    parsedRows.push({
      rowNumber,
      data,
      warnings,
      errors,
      isValid,
      originalData,
    });
  }

  return {
    rows: parsedRows,
    headers,
    validCount,
    warningCount,
    errorCount,
  };
}
