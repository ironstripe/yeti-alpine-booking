/**
 * Swiss QR-Rechnung utilities according to SIX Swiss Payment Standards
 * https://www.six-group.com/en/products-services/banking-services/payment-standardization/standards/qr-bill.html
 */

/**
 * Calculate Mod10 recursive check digit for QR-Reference
 */
export function calculateMod10Recursive(ref: string): string {
  const table = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
  let carry = 0;
  for (const char of ref) {
    carry = table[(carry + parseInt(char)) % 10];
  }
  return String((10 - carry) % 10);
}

/**
 * Generate a 27-digit QR-Reference from invoice number
 * Format: 00 00000 00000 00000 00000 NNNNN + check digit
 */
export function generateQRReference(invoiceNumber: string): string {
  // Extract numeric part from invoice number (e.g., "R-2026-00042" -> "42")
  const numericPart = invoiceNumber.replace(/\D/g, '');
  
  // Pad to 26 digits
  const paddedNumber = numericPart.padStart(26, '0');
  
  // Calculate check digit
  const checkDigit = calculateMod10Recursive(paddedNumber);
  
  return paddedNumber + checkDigit;
}

/**
 * Format QR-Reference for display (groups of 5)
 * "000000000000000000000000427" -> "00 00000 00000 00000 00000 00427"
 */
export function formatQRReference(ref: string): string {
  if (!ref || ref.length !== 27) return ref;
  return ref.replace(/(.{2})(.{5})(.{5})(.{5})(.{5})(.{5})/, '$1 $2 $3 $4 $5 $6');
}

/**
 * Format IBAN for display (groups of 4)
 * "LI21088100000000000000" -> "LI21 0881 0000 0000 0000 00"
 */
export function formatIBAN(iban: string): string {
  if (!iban) return '';
  const cleaned = iban.replace(/\s/g, '');
  return cleaned.match(/.{1,4}/g)?.join(' ') || cleaned;
}

/**
 * Validate Swiss/Liechtenstein IBAN
 */
export function isValidIBAN(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, '').toUpperCase();
  return /^(CH|LI)\d{2}\d{4}\d{12}$/.test(cleaned);
}

export interface SwissQRCodeData {
  // Creditor (School)
  creditorIBAN: string;
  creditorName: string;
  creditorStreet: string;
  creditorCity: string;
  creditorPostal: string;
  creditorCountry: 'LI' | 'CH';
  
  // Payment
  amount: number;
  currency: 'CHF' | 'EUR';
  
  // Debtor (Customer) - optional
  debtorName?: string;
  debtorStreet?: string;
  debtorCity?: string;
  debtorPostal?: string;
  debtorCountry?: string;
  
  // Reference
  referenceType: 'QRR' | 'SCOR' | 'NON';
  reference: string;
  
  // Additional info
  message?: string;
}

/**
 * Build Swiss QR-Code payload string according to SIX standard
 */
export function buildSwissQRPayload(data: SwissQRCodeData): string {
  const lines = [
    'SPC',                                      // QR Type
    '0200',                                     // Version
    '1',                                        // Coding (UTF-8)
    data.creditorIBAN.replace(/\s/g, ''),       // IBAN
    'K',                                        // Address type: K = Combined
    data.creditorName.substring(0, 70),         // Name (max 70)
    data.creditorStreet.substring(0, 70),       // Street or Address line 1
    `${data.creditorPostal} ${data.creditorCity}`.substring(0, 70), // Building + postal + city
    '',                                         // Empty (for address type S)
    '',                                         // Empty (for address type S)
    data.creditorCountry,                       // Country
    '',                                         // Ultimate creditor - empty
    '',
    '',
    '',
    '',
    '',
    '',
    data.amount ? data.amount.toFixed(2) : '',  // Amount
    data.currency,                              // Currency
    data.debtorName ? 'K' : '',                 // Debtor address type
    data.debtorName?.substring(0, 70) || '',    // Debtor name
    data.debtorStreet?.substring(0, 70) || '',  // Debtor street
    data.debtorCity ? `${data.debtorPostal || ''} ${data.debtorCity}`.trim().substring(0, 70) : '',
    '',                                         // Empty
    '',                                         // Empty
    data.debtorCountry || '',                   // Debtor country
    data.referenceType,                         // Reference type
    data.reference || '',                       // Reference
    data.message?.substring(0, 140) || '',      // Unstructured message (max 140)
    'EPD',                                      // End Payment Data
    ''                                          // Billing info (empty)
  ];
  
  return lines.join('\n');
}

/**
 * Format currency amount for display
 */
export function formatCurrency(amount: number, currency: string = 'CHF'): string {
  return new Intl.NumberFormat('de-CH', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}
