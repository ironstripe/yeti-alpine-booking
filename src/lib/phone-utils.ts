/**
 * Normalizes a phone number to compact international format (no spaces)
 * Handles Swiss (+41), Liechtenstein (+423), Austrian (+43), and German (+49) numbers
 * Returns: +41798168920 (compact, for storage)
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return "";

  // Remove ALL non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, "");

  // Handle different input formats
  if (cleaned.startsWith("00")) {
    // 0041... or 00423... → +41... or +423...
    cleaned = "+" + cleaned.slice(2);
  } else if (cleaned.startsWith("0") && !cleaned.startsWith("00")) {
    // 079... → +4179... (assume Swiss for local numbers)
    cleaned = "+41" + cleaned.slice(1);
  } else if (!cleaned.startsWith("+") && cleaned.length >= 7) {
    // No prefix, assume Swiss
    cleaned = "+41" + cleaned;
  } else if (!cleaned.startsWith("+") && cleaned.length > 0) {
    cleaned = "+" + cleaned;
  }

  // Return compact format - NO SPACES
  return cleaned;
}

/**
 * Formats a phone number for display with proper spacing
 * Input: +41798168920 (compact)
 * Output: +41 79 816 89 20 (formatted for display)
 */
export function formatPhoneDisplay(phone: string): string {
  if (!phone) return "";

  // Ensure we have normalized format first (remove any spaces)
  const normalized = phone.replace(/[^\d+]/g, "");

  // Format based on country code for display
  if (normalized.startsWith("+41") && normalized.length === 12) {
    // Swiss: +41 79 123 45 67
    const digits = normalized.slice(3);
    return `+41 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7)}`;
  } else if (normalized.startsWith("+423") && normalized.length >= 11 && normalized.length <= 12) {
    // Liechtenstein: +423 xxx xx xx
    const digits = normalized.slice(4);
    return `+423 ${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5)}`;
  } else if (normalized.startsWith("+43") && normalized.length >= 13 && normalized.length <= 14) {
    // Austrian: +43 xxx xxx xx xx
    const digits = normalized.slice(3);
    return `+43 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}`;
  } else if (normalized.startsWith("+49") && normalized.length >= 13 && normalized.length <= 15) {
    // German: +49 xxx xxx xx xx
    const digits = normalized.slice(3);
    return `+49 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}`;
  }

  // Return as-is for other formats
  return normalized;
}

/**
 * Capitalizes the first letter of each word in a name
 */
export function capitalizeName(name: string): string {
  if (!name) return "";
  return name
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
