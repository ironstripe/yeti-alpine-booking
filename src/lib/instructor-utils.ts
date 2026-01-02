/**
 * Validates and formats Swiss IBAN
 * Format: CH## #### #### #### #### #
 */
export function formatIBAN(iban: string): string {
  if (!iban) return "";
  
  // Remove all spaces and convert to uppercase
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  
  // Add spaces every 4 characters
  return cleaned.replace(/(.{4})/g, "$1 ").trim();
}

export function isValidIBAN(iban: string): boolean {
  if (!iban) return false;
  
  const cleaned = iban.replace(/\s/g, "").toUpperCase();
  
  // Swiss IBAN: CH + 2 check digits + 17 characters = 21 total
  if (cleaned.length !== 21 || !cleaned.startsWith("CH")) {
    return false;
  }
  
  // Check if it's alphanumeric
  return /^CH\d{2}[A-Z0-9]{17}$/.test(cleaned);
}

/**
 * Formats Swiss AHV number
 * Format: 756.XXXX.XXXX.XX
 */
export function formatAHVNumber(ahv: string): string {
  if (!ahv) return "";
  
  // Remove all non-digits
  const cleaned = ahv.replace(/\D/g, "");
  
  // Format as 756.XXXX.XXXX.XX
  if (cleaned.length >= 13) {
    return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 7)}.${cleaned.slice(7, 11)}.${cleaned.slice(11, 13)}`;
  }
  
  return cleaned;
}

export function isValidAHVNumber(ahv: string): boolean {
  if (!ahv) return false;
  
  // Remove all non-digits
  const cleaned = ahv.replace(/\D/g, "");
  
  // AHV number should be 13 digits and start with 756
  return cleaned.length === 13 && cleaned.startsWith("756");
}

/**
 * Level display names in German
 */
export const LEVEL_OPTIONS = [
  { value: "praktikant", label: "Praktikant" },
  { value: "hilfslehrer", label: "Hilfslehrer" },
  { value: "schneesportlehrer", label: "Schneesportlehrer" },
  { value: "swiss_snowsports", label: "Swiss Snowsports (J+S)" },
  { value: "experte", label: "Experte" },
] as const;

export const STATUS_OPTIONS = [
  { value: "active", label: "Aktiv" },
  { value: "inactive", label: "Inaktiv" },
  { value: "paused", label: "Pausiert" },
] as const;

export const SPECIALIZATION_OPTIONS = [
  { value: "ski", label: "Ski" },
  { value: "snowboard", label: "Snowboard" },
  { value: "both", label: "Beides" },
] as const;

export function getLevelLabel(level: string | null): string {
  const option = LEVEL_OPTIONS.find((o) => o.value === level);
  return option?.label ?? level ?? "-";
}
