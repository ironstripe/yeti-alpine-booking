import { normalizePhoneNumber, capitalizeName } from "./phone-utils";
import { formatAHVNumber, formatIBAN, isValidIBAN, isValidAHVNumber } from "./instructor-utils";
import type { TablesInsert } from "@/integrations/supabase/types";

type InstructorInsert = TablesInsert<"instructors">;

export interface ParsedInstructorRow {
  rowNumber: number;
  data: Partial<InstructorInsert>;
  warnings: string[];
  errors: string[];
  originalData: Record<string, string>;
}

export interface CSVParseResult {
  rows: ParsedInstructorRow[];
  headers: string[];
  validCount: number;
  warningCount: number;
  errorCount: number;
}

// Column mapping from German CSV headers to database fields (case-insensitive, normalized)
const COLUMN_MAP: Record<string, keyof InstructorInsert | "extra"> = {
  "name": "last_name",
  "nachname": "last_name",
  "vorname": "first_name",
  "geburtsdatum": "birth_date",
  "email": "email",
  "telefon": "phone",
  "adresse": "street",
  "strasse": "street",
  "plz": "zip",
  "ort": "city",
  "land": "country",
  "status": "status",
  "ahvpeid": "ahv_number",
  "ahv_peid": "ahv_number",
  "ahv": "ahv_number",
  "lohnaktuell": "hourly_rate",
  "lohn_aktuell": "hourly_rate",
  "stundenlohn": "hourly_rate",
  "iban": "iban",
  "sprachen": "languages",
  "nationalitaet": "extra",
  "zivilstand": "extra",
  "bank": "bank_name",
  "bankname": "bank_name",
  "notizen": "notes",
  "bemerkungen": "notes",
};

// Country name to ISO code mapping
const COUNTRY_MAP: Record<string, string> = {
  "schweiz": "CH",
  "ch": "CH",
  "liechtenstein": "LI",
  "li": "LI",
  "oesterreich": "AT",
  "österreich": "AT",
  "austria": "AT",
  "at": "AT",
  "deutschland": "DE",
  "germany": "DE",
  "de": "DE",
};

/**
 * Parse a date string in DD.MM.YYYY format to YYYY-MM-DD
 */
function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  // Handle DD.MM.YYYY format
  const parts = dateStr.split(".");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    const d = parseInt(day, 10);
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 1900 && y <= 2100) {
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }
  
  // Try ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  return null;
}

/**
 * Parse hourly rate from string
 */
function parseHourlyRate(rateStr: string): number {
  if (!rateStr) return 30.0;
  
  // Check for non-numeric values like "Bankueberweisung"
  if (!/\d/.test(rateStr)) {
    return 30.0;
  }
  
  // Replace comma with dot and parse
  const cleaned = rateStr.replace(",", ".").replace(/[^\d.]/g, "");
  const parsed = parseFloat(cleaned);
  
  return isNaN(parsed) || parsed <= 0 ? 30.0 : parsed;
}

/**
 * Parse languages string to array
 */
function parseLanguages(langStr: string): string[] {
  if (!langStr) return ["de"];
  
  return langStr
    .split(/[,;]/)
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l.length === 2);
}

/**
 * Map country name to ISO code
 */
function mapCountry(countryStr: string): string {
  if (!countryStr) return "CH";
  const key = countryStr.toLowerCase().trim();
  return COUNTRY_MAP[key] || "CH";
}

/**
 * Parse CSV content to array of rows
 */
export function parseCSVContent(content: string, delimiter = ";"): string[][] {
  // Remove BOM if present (common in Excel-exported CSVs)
  let cleanContent = content;
  if (content.charCodeAt(0) === 0xFEFF) {
    cleanContent = content.slice(1);
  }
  
  const lines = cleanContent.split(/\r?\n/).filter((line) => line.trim());
  
  return lines.map((line) => {
    // Handle quoted values
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
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
 * Parse instructor CSV and validate data
 */
export function parseInstructorCSV(content: string): CSVParseResult {
  const rows = parseCSVContent(content);
  
  if (rows.length < 2) {
    return {
      rows: [],
      headers: [],
      validCount: 0,
      warningCount: 0,
      errorCount: 1,
    };
  }
  
  // Normalize headers: lowercase, remove special chars, trim
  const headers = rows[0].map((h) => 
    h.toLowerCase()
      .trim()
      .replace(/ä/g, "a")
      .replace(/ö/g, "o")
      .replace(/ü/g, "u")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9_]/g, "")
  );
  
  console.log("[CSV Parser] Detected headers:", headers);
  
  const dataRows = rows.slice(1);
  
  const parsedRows: ParsedInstructorRow[] = [];
  let validCount = 0;
  let warningCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNumber = i + 2; // +2 for 1-based index and header row
    const warnings: string[] = [];
    const errors: string[] = [];
    const originalData: Record<string, string> = {};
    const data: Partial<InstructorInsert> = {};
    
    // Extra fields to store in notes
    const extraFields: string[] = [];
    
    // Map each column
    headers.forEach((header, colIndex) => {
      const value = row[colIndex]?.trim() || "";
      originalData[header] = value;
      
      const dbField = COLUMN_MAP[header];
      if (!dbField) return;
      
      if (dbField === "extra") {
        if (value) {
          if (header === "nationalitaet") {
            extraFields.push(`Nationalität: ${value}`);
          } else if (header === "zivilstand") {
            extraFields.push(`Zivilstand: ${value}`);
          }
        }
        return;
      }
      
      switch (dbField) {
        case "first_name":
          data.first_name = capitalizeName(value);
          break;
          
        case "last_name":
          data.last_name = capitalizeName(value);
          break;
          
        case "email":
          if (value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
            data.email = value.toLowerCase();
          } else if (value) {
            errors.push("Ungültige E-Mail-Adresse");
          }
          break;
          
        case "phone":
          if (value) {
            data.phone = normalizePhoneNumber(value);
          }
          break;
          
        case "birth_date": {
          const parsed = parseDate(value);
          if (parsed) {
            data.birth_date = parsed;
          } else if (value) {
            warnings.push("Geburtsdatum konnte nicht geparst werden");
          }
          break;
        }
          
        case "street":
          data.street = value || null;
          break;
          
        case "zip":
          data.zip = value || null;
          break;
          
        case "city":
          data.city = value ? capitalizeName(value) : null;
          break;
          
        case "country":
          data.country = mapCountry(value);
          break;
          
        case "status":
          // Map all statuses to 'active' for the database
          data.status = "active";
          if (value && !["aktiv", "active"].includes(value.toLowerCase())) {
            extraFields.push(`Original-Status: ${value}`);
          }
          break;
          
        case "ahv_number":
          if (value && value !== "-") {
            const formatted = formatAHVNumber(value);
            if (isValidAHVNumber(formatted)) {
              data.ahv_number = formatted;
            } else {
              warnings.push("AHV-Nummer ungültig");
              data.ahv_number = value; // Store anyway
            }
          }
          break;
          
        case "hourly_rate":
          data.hourly_rate = parseHourlyRate(value);
          if (value && !/\d/.test(value)) {
            extraFields.push(`Lohn-Info: ${value}`);
          }
          break;
          
        case "iban":
          if (value && value !== "-") {
            const formatted = formatIBAN(value);
            if (isValidIBAN(formatted)) {
              data.iban = formatted;
            } else {
              warnings.push("IBAN-Format ungültig");
              data.iban = formatted; // Store anyway for manual review
            }
          }
          break;
          
        case "languages":
          data.languages = parseLanguages(value);
          break;
          
        case "bank_name":
          data.bank_name = value || null;
          break;
          
        case "notes":
          if (value) {
            extraFields.push(value);
          }
          break;
      }
    });
    
    // Set defaults for required/missing fields
    if (!data.level) {
      data.level = "hilfslehrer";
      warnings.push("Level auf 'Hilfslehrer' gesetzt");
    }
    
    if (!data.specialization) {
      data.specialization = "ski";
    }
    
    if (!data.hourly_rate) {
      data.hourly_rate = 30.0;
    }
    
    data.real_time_status = "unavailable";
    
    // Combine extra fields into notes
    if (extraFields.length > 0) {
      data.notes = extraFields.join(" | ");
    }
    
    // Validate required fields
    if (!data.first_name) {
      errors.push("Vorname fehlt");
    }
    if (!data.last_name) {
      errors.push("Nachname fehlt");
    }
    if (!data.email) {
      errors.push("E-Mail fehlt");
    }
    if (!data.phone) {
      errors.push("Telefon fehlt");
    }
    
    // Count row status
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
      originalData,
    });
  }
  
  return {
    rows: parsedRows,
    headers: rows[0],
    validCount,
    warningCount,
    errorCount,
  };
}

/**
 * Get valid instructor records ready for insert
 */
export function getValidInstructorRecords(result: CSVParseResult): InstructorInsert[] {
  return result.rows
    .filter((row) => row.errors.length === 0)
    .map((row) => row.data as InstructorInsert);
}
