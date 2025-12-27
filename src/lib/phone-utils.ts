/**
 * Normalizes a phone number to international format
 * Handles Swiss (+41) and Liechtenstein (+423) numbers
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return "";

  // Remove all non-digit characters except +
  let cleaned = phone.replace(/[^\d+]/g, "");

  // Handle different formats
  if (cleaned.startsWith("00")) {
    // 0041... → +41...
    cleaned = "+" + cleaned.slice(2);
  } else if (cleaned.startsWith("0") && !cleaned.startsWith("00")) {
    // 079... → +41 79...
    cleaned = "+41" + cleaned.slice(1);
  } else if (!cleaned.startsWith("+") && cleaned.length >= 10) {
    // Assume Swiss if no prefix
    cleaned = "+41" + cleaned;
  }

  // Format based on country code
  if (cleaned.startsWith("+41")) {
    // Swiss format: +41 79 123 45 67
    const match = cleaned.match(/^\+41(\d{2})(\d{3})(\d{2})(\d{2})$/);
    if (match) {
      return `+41 ${match[1]} ${match[2]} ${match[3]} ${match[4]}`;
    }
  } else if (cleaned.startsWith("+423")) {
    // Liechtenstein format: +423 123 45 67
    const match = cleaned.match(/^\+423(\d{3})(\d{2})(\d{2})$/);
    if (match) {
      return `+423 ${match[1]} ${match[2]} ${match[3]}`;
    }
    // Alternative format with more digits
    const matchLong = cleaned.match(/^\+423(\d{3})(\d{4})$/);
    if (matchLong) {
      return `+423 ${matchLong[1]} ${matchLong[2]}`;
    }
  } else if (cleaned.startsWith("+43")) {
    // Austrian format: +43 664 123 45 67
    const match = cleaned.match(/^\+43(\d{3})(\d{3})(\d{2})(\d{2})$/);
    if (match) {
      return `+43 ${match[1]} ${match[2]} ${match[3]} ${match[4]}`;
    }
  } else if (cleaned.startsWith("+49")) {
    // German format: +49 170 123 45 67
    const match = cleaned.match(/^\+49(\d{3})(\d{3})(\d{2})(\d{2})$/);
    if (match) {
      return `+49 ${match[1]} ${match[2]} ${match[3]} ${match[4]}`;
    }
  }

  // Return cleaned version if no specific format matches
  return cleaned.startsWith("+") ? cleaned : phone;
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
