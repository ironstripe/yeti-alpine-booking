// Type validators for data import

/**
 * Validate UUID format
 */
export function isValidUUID(value: string): boolean {
  if (!value) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Validate date format YYYY-MM-DD
 */
export function isValidDate(value: string): boolean {
  if (!value) return false;
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(value)) return false;
  
  const date = new Date(value);
  return !isNaN(date.getTime());
}

/**
 * Validate time format HH:MM:SS or HH:MM
 */
export function isValidTime(value: string): boolean {
  if (!value) return false;
  const timeRegex = /^\d{2}:\d{2}(:\d{2})?$/;
  return timeRegex.test(value);
}

/**
 * Validate email format
 */
export function isValidEmail(value: string): boolean {
  if (!value) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}

/**
 * Validate number (integer or decimal)
 */
export function isValidNumber(value: string): boolean {
  if (!value) return false;
  const num = parseFloat(value);
  return !isNaN(num);
}

/**
 * Validate boolean-like value
 */
export function isValidBoolean(value: string): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return ["true", "false", "1", "0", "yes", "no", "ja", "nein"].includes(normalized);
}

/**
 * Parse boolean-like value
 */
export function parseBoolean(value: string): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return ["true", "1", "yes", "ja"].includes(normalized);
}

/**
 * Clean string value - trim and convert empty to null
 */
export function cleanString(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Parse number from string
 */
export function parseNumber(value: string): number | null {
  if (!value) return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

/**
 * Parse integer from string
 */
export function parseInteger(value: string): number | null {
  if (!value) return null;
  const num = parseInt(value, 10);
  return isNaN(num) ? null : num;
}

/**
 * Validate and type of a value based on expected type
 */
export function validateType(
  value: string,
  type: "uuid" | "date" | "time" | "number" | "boolean" | "string" | "email"
): { valid: boolean; error?: string } {
  if (!value || value.trim() === "") {
    return { valid: true }; // Empty values are handled by required field checks
  }

  switch (type) {
    case "uuid":
      return isValidUUID(value)
        ? { valid: true }
        : { valid: false, error: `Invalid UUID format: ${value}` };
    case "date":
      return isValidDate(value)
        ? { valid: true }
        : { valid: false, error: `Invalid date format (expected YYYY-MM-DD): ${value}` };
    case "time":
      return isValidTime(value)
        ? { valid: true }
        : { valid: false, error: `Invalid time format (expected HH:MM or HH:MM:SS): ${value}` };
    case "number":
      return isValidNumber(value)
        ? { valid: true }
        : { valid: false, error: `Invalid number: ${value}` };
    case "boolean":
      return isValidBoolean(value)
        ? { valid: true }
        : { valid: false, error: `Invalid boolean: ${value}` };
    case "email":
      return isValidEmail(value)
        ? { valid: true }
        : { valid: false, error: `Invalid email format: ${value}` };
    case "string":
    default:
      return { valid: true };
  }
}
