/**
 * Normalizes a phone number to international format
 * Handles Swiss (+41), Liechtenstein (+423), Austrian (+43), and German (+49) numbers
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return "";

  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, "");

  // Handle different formats
  if (cleaned.startsWith("00")) {
    // 0041... or 0043... → +41... or +43...
    cleaned = "+" + cleaned.slice(2);
  } else if (cleaned.startsWith("0") && !cleaned.startsWith("00")) {
    // 079... → +41 79... (assume Swiss for local numbers)
    cleaned = "+41" + cleaned.slice(1);
  } else if (!cleaned.startsWith("+") && cleaned.length >= 10) {
    // Assume Swiss if no prefix
    cleaned = "+41" + cleaned;
  }

  // Format based on country code - more flexible patterns
  if (cleaned.startsWith("+41")) {
    // Swiss format: +41 79 123 45 67 (total 12 chars after +41)
    const digits = cleaned.slice(3);
    if (digits.length === 9) {
      return `+41 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
    }
    return `+41 ${digits}`;
  } else if (cleaned.startsWith("+423")) {
    // Liechtenstein format: +423 xxx xx xx or +423 xxx xxxx (7-10 digits after +423)
    const digits = cleaned.slice(4);
    if (digits.length === 7) {
      return `+423 ${digits.slice(0, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)}`;
    }
    return `+423 ${digits}`;
  } else if (cleaned.startsWith("+43")) {
    // Austrian format: +43 xxx xxx xx xx (10-11 digits after +43)
    const digits = cleaned.slice(3);
    if (digits.length >= 10 && digits.length <= 12) {
      return `+43 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}`;
    }
    return `+43 ${digits}`;
  } else if (cleaned.startsWith("+49")) {
    // German format: +49 xxx xxx xx xx (10-12 digits after +49)
    const digits = cleaned.slice(3);
    if (digits.length >= 10 && digits.length <= 12) {
      return `+49 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}`;
    }
    return `+49 ${digits}`;
  }

  // Return cleaned version if no specific format matches
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
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
