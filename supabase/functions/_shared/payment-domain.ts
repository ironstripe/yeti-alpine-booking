/**
 * Payment domain — single source of truth for IBAN / reference validation,
 * payment routing and Swiss QR payload building.
 *
 * This file is imported by both Edge Functions (Deno) and the frontend (Vite).
 * Keep it dependency-free and deterministic.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PresentationType = "swiss_qr" | "sepa_transfer" | "international_transfer";
export type ReferenceType = "QRR" | "SCOR" | "NON" | "INVOICE_NUMBER";
export type CountryScope = "CH_LI" | "SEPA" | "INTERNATIONAL";
export type AccountType = "iban" | "qr_iban";
export type Currency = "CHF" | "EUR";

export interface StructuredAddress {
  street?: string | null;
  houseNumber?: string | null;
  zip?: string | null;
  city?: string | null;
  country?: string | null; // ISO-2 uppercase
}

export interface PaymentProfile {
  id: string;
  name: string;
  presentation_type: PresentationType;
  bank_name?: string | null;
  account_holder: string;
  iban: string;
  bic_swift?: string | null;
  account_holder_street?: string | null;
  account_holder_house_number?: string | null;
  account_holder_zip: string;
  account_holder_city: string;
  account_holder_country: string;
  currency: Currency;
  reference_type: ReferenceType;
  country_scope: CountryScope;
  account_type: AccountType;
  is_default?: boolean;
  is_active?: boolean;
  is_archived?: boolean;
  validation_status?: "draft" | "valid" | "invalid";
  valid_from?: string | null;
  valid_until?: string | null;
}

export interface PaymentSnapshot {
  profile_id: string;
  profile_name: string;
  bank_name: string | null;
  account_holder: string;
  account_holder_address: Required<StructuredAddress>;
  iban: string;
  iban_formatted: string;
  bic_swift: string | null;
  account_type: AccountType;
  currency: Currency;
  reference_type: ReferenceType;
  reference: string;
  country_scope: CountryScope;
  presentation_type: PresentationType;
  payment_message: string;
  due_date: string | null;
  payload_version: string | null;
  qr_payload: string | null;
  snapshot_created_at: string;
}

export interface RoutingResult {
  ok: boolean;
  presentation_type?: PresentationType;
  profile?: PaymentProfile;
  reference_type?: ReferenceType;
  reference?: string;
  routing_reason?: string;
  snapshot?: PaymentSnapshot;
  error_code?: string;
  error?: string; // German, user facing
}

// ---------------------------------------------------------------------------
// Country data
// ---------------------------------------------------------------------------

/** SEPA scheme participants (ISO-2). */
export const SEPA_COUNTRIES = [
  "AD", "AT", "BE", "BG", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR",
  "GB", "GI", "GR", "HR", "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MC",
  "MT", "NL", "NO", "PL", "PT", "RO", "SE", "SI", "SK", "SM", "VA",
] as const;

const IBAN_LENGTHS: Record<string, number> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29,
  BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28, EE: 20, EG: 29,
  ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28,
  HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26, IT: 27, JO: 30, KW: 30, KZ: 20,
  LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, LY: 25, MC: 27, MD: 24, ME: 22,
  MK: 19, MR: 27, MT: 31, MU: 30, NL: 18, NO: 15, PK: 24, PL: 28, PS: 29, PT: 25,
  QA: 29, RO: 24, RS: 22, SA: 24, SC: 31, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25,
  SV: 28, TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
};

export function isValidCountryCode(code: unknown): code is string {
  return typeof code === "string" && /^[A-Z]{2}$/.test(code) && code in ISO_COUNTRIES;
}

/** Minimal ISO 3166-1 alpha-2 set (validity check only). */
const ISO_COUNTRIES: Record<string, true> = Object.fromEntries(
  ("AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW")
    .split(" ")
    .map((c) => [c, true as const]),
);

export function isSepaCountry(country: string): boolean {
  return (SEPA_COUNTRIES as readonly string[]).includes(country);
}

// ---------------------------------------------------------------------------
// IBAN
// ---------------------------------------------------------------------------

export function normalizeIBAN(iban: string): string {
  return (iban || "").replace(/[\s\u00a0-]/g, "").toUpperCase();
}

function mod97(input: string): number {
  let remainder = 0;
  for (const ch of input) {
    remainder = (remainder * 10 + Number(ch)) % 97;
  }
  return remainder;
}

function toNumeric(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code >= 65 && code <= 90) out += String(code - 55);
    else out += ch;
  }
  return out;
}

export interface IBANValidation {
  valid: boolean;
  normalized: string;
  country?: string;
  accountType?: AccountType;
  qrIid?: string;
  error?: string;
}

export function validateIBAN(rawIban: string): IBANValidation {
  const normalized = normalizeIBAN(rawIban);
  if (!normalized) return { valid: false, normalized, error: "IBAN fehlt" };
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(normalized)) {
    return { valid: false, normalized, error: "IBAN enthält ungültige Zeichen" };
  }
  const country = normalized.slice(0, 2);
  const expectedLength = IBAN_LENGTHS[country];
  if (!expectedLength) {
    return { valid: false, normalized, country, error: `IBAN-Land ${country} wird nicht unterstützt` };
  }
  if (normalized.length !== expectedLength) {
    return {
      valid: false, normalized, country,
      error: `IBAN für ${country} muss ${expectedLength} Zeichen haben (aktuell ${normalized.length})`,
    };
  }
  const rearranged = normalized.slice(4) + normalized.slice(0, 4);
  if (mod97(toNumeric(rearranged)) !== 1) {
    return { valid: false, normalized, country, error: "IBAN-Prüfsumme (MOD-97) ist ungültig" };
  }

  let accountType: AccountType = "iban";
  let qrIid: string | undefined;
  if (country === "CH" || country === "LI") {
    qrIid = normalized.slice(4, 9);
    const iid = Number(qrIid);
    if (iid >= 30000 && iid <= 31999) accountType = "qr_iban";
  }
  return { valid: true, normalized, country, accountType, qrIid };
}

export function isQRIBAN(iban: string): boolean {
  return validateIBAN(iban).accountType === "qr_iban";
}

export function formatIBAN(iban: string): string {
  const cleaned = normalizeIBAN(iban);
  return cleaned.match(/.{1,4}/g)?.join(" ") ?? cleaned;
}

export function maskIBAN(iban: string): string {
  const cleaned = normalizeIBAN(iban);
  if (cleaned.length < 8) return cleaned;
  return `${cleaned.slice(0, 4)} •••• ${cleaned.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

export function mod10Recursive(digits: string): string {
  const table = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
  let carry = 0;
  for (const ch of digits) {
    carry = table[(carry + Number(ch)) % 10];
  }
  return String((10 - carry) % 10);
}

/** Deterministic numeric payload derived from an invoice identifier. */
function numericSeed(source: string): string {
  const digits = (source || "").replace(/\D/g, "");
  if (digits) return digits;
  // Fall back to a deterministic numeric hash of the identifier (e.g. a uuid).
  let hash = 0n;
  for (const ch of source) hash = (hash * 131n + BigInt(ch.charCodeAt(0))) % 10n ** 20n;
  return hash.toString();
}

/** Generate a 27 digit QR reference (26 payload digits + MOD-10 check digit). */
export function generateQRReference(invoiceIdentifier: string): string {
  const seed = numericSeed(invoiceIdentifier);
  const payload = seed.slice(-26).padStart(26, "0");
  if (/^0{26}$/.test(payload)) {
    throw new Error("QR-Referenz darf nicht ausschliesslich aus Nullen bestehen");
  }
  return payload + mod10Recursive(payload);
}

export function isValidQRReference(reference: string): boolean {
  const ref = (reference || "").replace(/\s/g, "");
  if (!/^\d{27}$/.test(ref)) return false;
  if (/^0{27}$/.test(ref)) return false;
  return mod10Recursive(ref.slice(0, 26)) === ref[26];
}

export function formatQRReference(reference: string): string {
  const ref = (reference || "").replace(/\s/g, "");
  if (ref.length !== 27) return reference;
  return ref.replace(/(.{2})(.{5})(.{5})(.{5})(.{5})(.{5})/, "$1 $2 $3 $4 $5 $6");
}

/** Generate an ISO 11649 creditor reference (RF + 2 check digits + reference). */
export function generateSCORReference(invoiceIdentifier: string): string {
  const base = (invoiceIdentifier || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 21);
  const core = base || numericSeed(invoiceIdentifier).slice(0, 21);
  const check = 98 - mod97(toNumeric(core + "RF00"));
  return `RF${String(check).padStart(2, "0")}${core}`;
}

export function isValidSCORReference(reference: string): boolean {
  const ref = (reference || "").replace(/\s/g, "").toUpperCase();
  if (!/^RF[0-9]{2}[A-Z0-9]{1,21}$/.test(ref)) return false;
  if (ref.length < 5 || ref.length > 25) return false;
  return mod97(toNumeric(ref.slice(4) + ref.slice(0, 4))) === 1;
}

export function formatSCORReference(reference: string): string {
  const ref = (reference || "").replace(/\s/g, "").toUpperCase();
  return ref.match(/.{1,4}/g)?.join(" ") ?? ref;
}

// ---------------------------------------------------------------------------
// Profile / combination validation
// ---------------------------------------------------------------------------

export interface ProfileValidation {
  valid: boolean;
  errors: string[];
  accountType?: AccountType;
}

export function validatePaymentProfile(profile: Partial<PaymentProfile>): ProfileValidation {
  const errors: string[] = [];
  const ibanResult = validateIBAN(profile.iban ?? "");
  if (!ibanResult.valid) errors.push(ibanResult.error ?? "IBAN ist ungültig");

  const accountType = ibanResult.accountType;

  if (!profile.account_holder?.trim()) errors.push("Kontoinhaber fehlt");
  if (!profile.account_holder_zip?.trim()) errors.push("PLZ des Kontoinhabers fehlt");
  if (!profile.account_holder_city?.trim()) errors.push("Ort des Kontoinhabers fehlt");
  if (!isValidCountryCode(profile.account_holder_country ?? "")) {
    errors.push("Land des Kontoinhabers ist kein gültiger ISO-2-Code");
  }
  if (profile.currency !== "CHF" && profile.currency !== "EUR") {
    errors.push("Währung muss CHF oder EUR sein");
  }

  if (profile.presentation_type === "swiss_qr") {
    if (ibanResult.valid && ibanResult.country !== "CH" && ibanResult.country !== "LI") {
      errors.push("Swiss QR benötigt eine CH- oder LI-IBAN");
    }
    if (!profile.account_holder_street?.trim()) errors.push("Strasse des Kontoinhabers fehlt (Pflicht für Swiss QR)");
    if (profile.country_scope !== "CH_LI") errors.push("Swiss QR ist nur für den Bereich CH/LI zulässig");
  }

  if (profile.reference_type === "QRR") {
    if (accountType !== "qr_iban") errors.push("QRR ist nur mit einer QR-IBAN zulässig");
    if (profile.currency !== "CHF") errors.push("QRR ist nur für CHF zulässig");
    if (profile.presentation_type !== "swiss_qr") errors.push("QRR ist nur für Swiss QR zulässig");
  } else if (accountType === "qr_iban") {
    errors.push("Eine QR-IBAN darf nur mit der Referenzart QRR verwendet werden");
  }

  if (profile.presentation_type === "sepa_transfer") {
    if (profile.currency !== "EUR") errors.push("SEPA-Überweisung erfordert EUR");
    if (!profile.bic_swift?.trim()) errors.push("BIC fehlt (Pflicht für SEPA)");
  }
  if (profile.presentation_type === "international_transfer" && !profile.bic_swift?.trim()) {
    errors.push("BIC/SWIFT fehlt (Pflicht für internationale Überweisung)");
  }

  return { valid: errors.length === 0, errors, accountType };
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export interface RoutingInput {
  billingCountry: string | null | undefined;
  currency: string | null | undefined;
  invoiceIdentifier: string; // invoice number or immutable invoice id
  invoiceNumber?: string;
  dueDate?: string | null;
  debtor?: { name: string } & StructuredAddress;
  amount?: number;
  profiles: PaymentProfile[];
  overrideProfileId?: string | null;
  overrideReason?: string | null;
}

export function determineCountryScope(billingCountry: string): CountryScope {
  if (billingCountry === "CH" || billingCountry === "LI") return "CH_LI";
  if (isSepaCountry(billingCountry)) return "SEPA";
  return "INTERNATIONAL";
}

export function determinePresentation(billingCountry: string, currency: Currency): PresentationType {
  const scope = determineCountryScope(billingCountry);
  if (scope === "CH_LI") return "swiss_qr";
  if (currency === "EUR" && scope === "SEPA") return "sepa_transfer";
  return "international_transfer";
}

function profileIsSelectable(p: PaymentProfile): boolean {
  return !!p.is_active && !p.is_archived && p.validation_status === "valid";
}

function profileIsValidNow(p: PaymentProfile, today: string): boolean {
  if (p.valid_from && p.valid_from > today) return false;
  if (p.valid_until && p.valid_until < today) return false;
  return true;
}

export function findCompatibleProfiles(
  profiles: PaymentProfile[],
  presentation: PresentationType,
  currency: Currency,
  today = new Date().toISOString().slice(0, 10),
): PaymentProfile[] {
  return profiles
    .filter((p) => profileIsSelectable(p) && profileIsValidNow(p, today))
    .filter((p) => p.currency === currency && p.presentation_type === presentation)
    // Swiss QR for EUR must never use a QR-IBAN + QRR combination.
    .filter((p) => !(presentation === "swiss_qr" && currency === "EUR" && p.account_type === "qr_iban"))
    .sort((a, b) => Number(b.is_default) - Number(a.is_default));
}

export function buildReference(
  referenceType: ReferenceType,
  invoiceIdentifier: string,
): string {
  switch (referenceType) {
    case "QRR":
      return generateQRReference(invoiceIdentifier);
    case "SCOR":
      return generateSCORReference(invoiceIdentifier);
    case "INVOICE_NUMBER":
      return invoiceIdentifier;
    case "NON":
    default:
      return "";
  }
}

export function routePayment(input: RoutingInput): RoutingResult {
  const billingCountry = (input.billingCountry ?? "").trim().toUpperCase();
  if (!isValidCountryCode(billingCountry)) {
    return {
      ok: false,
      error_code: "MISSING_BILLING_COUNTRY",
      error: "Rechnungsadresse unvollständig: Es fehlt ein gültiges Land (ISO-2) der Rechnungsempfängerin bzw. des Rechnungsempfängers.",
    };
  }
  const currency = (input.currency ?? "").trim().toUpperCase();
  if (currency !== "CHF" && currency !== "EUR") {
    return {
      ok: false,
      error_code: "UNSUPPORTED_CURRENCY",
      error: `Währung «${currency || "unbekannt"}» wird nicht unterstützt. Zulässig sind CHF und EUR.`,
    };
  }

  const presentation = determinePresentation(billingCountry, currency as Currency);
  const compatible = findCompatibleProfiles(input.profiles, presentation, currency as Currency);

  let profile = compatible[0];
  let overridden = false;
  if (input.overrideProfileId) {
    const chosen = compatible.find((p) => p.id === input.overrideProfileId);
    if (!chosen) {
      return {
        ok: false,
        error_code: "INCOMPATIBLE_OVERRIDE",
        error: "Das gewählte Zahlungsprofil ist mit Land und Währung dieser Rechnung nicht kompatibel.",
      };
    }
    if (!input.overrideReason?.trim()) {
      return {
        ok: false,
        error_code: "OVERRIDE_REASON_REQUIRED",
        error: "Für eine manuelle Auswahl des Zahlungsprofils ist eine Begründung erforderlich.",
      };
    }
    profile = chosen;
    overridden = true;
  }

  if (!profile) {
    const label = presentation === "swiss_qr"
      ? "Swiss QR-Rechnung"
      : presentation === "sepa_transfer"
      ? "SEPA-Überweisung"
      : "internationale Überweisung";
    return {
      ok: false,
      error_code: "NO_COMPATIBLE_PROFILE",
      error: `Kein aktives, geprüftes Zahlungsprofil für ${label} in ${currency} vorhanden. Bitte unter Einstellungen → Schule → Rechnungen & Bankkonten ein passendes Profil anlegen und freigeben.`,
    };
  }

  const profileCheck = validatePaymentProfile(profile);
  if (!profileCheck.valid) {
    return {
      ok: false,
      error_code: "INVALID_PROFILE",
      error: `Das Zahlungsprofil «${profile.name}» ist unvollständig: ${profileCheck.errors.join(", ")}`,
    };
  }

  const reference = buildReference(profile.reference_type, input.invoiceIdentifier);
  const message = input.invoiceNumber ? `Rechnung ${input.invoiceNumber}` : "";

  const snapshot: PaymentSnapshot = {
    profile_id: profile.id,
    profile_name: profile.name,
    bank_name: profile.bank_name ?? null,
    account_holder: profile.account_holder,
    account_holder_address: {
      street: profile.account_holder_street ?? "",
      houseNumber: profile.account_holder_house_number ?? "",
      zip: profile.account_holder_zip,
      city: profile.account_holder_city,
      country: profile.account_holder_country,
    },
    iban: normalizeIBAN(profile.iban),
    iban_formatted: formatIBAN(profile.iban),
    bic_swift: profile.bic_swift ?? null,
    account_type: profile.account_type,
    currency: currency as Currency,
    reference_type: profile.reference_type,
    reference,
    country_scope: profile.country_scope,
    presentation_type: presentation,
    payment_message: message,
    due_date: input.dueDate ?? null,
    payload_version: presentation === "swiss_qr" ? "0200" : null,
    qr_payload: null,
    snapshot_created_at: new Date().toISOString(),
  };

  if (presentation === "swiss_qr") {
    const payload = buildSwissQRPayload({
      creditorIBAN: snapshot.iban,
      creditorName: snapshot.account_holder,
      creditorStreet: profile.account_holder_street ?? "",
      creditorHouseNumber: profile.account_holder_house_number ?? "",
      creditorZip: profile.account_holder_zip,
      creditorCity: profile.account_holder_city,
      creditorCountry: profile.account_holder_country,
      amount: input.amount,
      currency: currency as Currency,
      debtorName: input.debtor?.name,
      debtorStreet: input.debtor?.street ?? undefined,
      debtorHouseNumber: input.debtor?.houseNumber ?? undefined,
      debtorZip: input.debtor?.zip ?? undefined,
      debtorCity: input.debtor?.city ?? undefined,
      debtorCountry: input.debtor?.country ?? undefined,
      referenceType: profile.reference_type === "QRR" ? "QRR" : profile.reference_type === "SCOR" ? "SCOR" : "NON",
      reference,
      message,
    });
    snapshot.qr_payload = payload;
  }

  const scope = determineCountryScope(billingCountry);
  const reason = overridden
    ? `Manuell gewählt (${profile.name}); automatisch vorgeschlagen aufgrund Rechnungsland ${billingCountry} und Währung ${currency}`
    : `Automatisch gewählt aufgrund Rechnungsland ${billingCountry} (${scope}) und Währung ${currency}`;

  return {
    ok: true,
    presentation_type: presentation,
    profile,
    reference_type: profile.reference_type,
    reference,
    routing_reason: reason,
    snapshot,
  };
}

// ---------------------------------------------------------------------------
// Swiss QR payload (SIX Implementation Guidelines 2.3 / 2.4, version 0200)
// ---------------------------------------------------------------------------

export interface SwissQRPayloadInput {
  creditorIBAN: string;
  creditorName: string;
  creditorStreet?: string;
  creditorHouseNumber?: string;
  creditorZip: string;
  creditorCity: string;
  creditorCountry: string;
  amount?: number;
  currency: Currency;
  debtorName?: string;
  debtorStreet?: string;
  debtorHouseNumber?: string;
  debtorZip?: string;
  debtorCity?: string;
  debtorCountry?: string;
  referenceType: "QRR" | "SCOR" | "NON";
  reference?: string;
  message?: string;
  billingInformation?: string;
}

const cut = (value: string | undefined, max: number) => (value ?? "").toString().slice(0, max);

export function buildSwissQRPayload(data: SwissQRPayloadInput): string {
  const iban = normalizeIBAN(data.creditorIBAN);
  const debtorComplete = !!(data.debtorName && data.debtorZip && data.debtorCity && data.debtorCountry);

  const lines = [
    "SPC",                                   // QRType
    "0200",                                  // Version
    "1",                                     // Coding type UTF-8
    iban,                                    // IBAN / QR-IBAN
    // Creditor — structured address (type S)
    "S",
    cut(data.creditorName, 70),
    cut(data.creditorStreet, 70),
    cut(data.creditorHouseNumber, 16),
    cut(data.creditorZip, 16),
    cut(data.creditorCity, 35),
    cut(data.creditorCountry, 2),
    // Ultimate creditor — must stay empty
    "", "", "", "", "", "", "",
    // Payment amount information
    data.amount != null ? data.amount.toFixed(2) : "",
    data.currency,
    // Ultimate debtor
    debtorComplete ? "S" : "",
    debtorComplete ? cut(data.debtorName, 70) : "",
    debtorComplete ? cut(data.debtorStreet, 70) : "",
    debtorComplete ? cut(data.debtorHouseNumber, 16) : "",
    debtorComplete ? cut(data.debtorZip, 16) : "",
    debtorComplete ? cut(data.debtorCity, 35) : "",
    debtorComplete ? cut(data.debtorCountry, 2) : "",
    // Payment reference
    data.referenceType,
    data.referenceType === "NON" ? "" : (data.reference ?? "").replace(/\s/g, ""),
    cut(data.message, 140),
    "EPD",                                   // Trailer
  ];

  if (data.billingInformation) lines.push(cut(data.billingInformation, 140));

  return lines.join("\r\n");
}

export interface QRPayloadValidation {
  valid: boolean;
  errors: string[];
}

export function validateSwissQRPayloadInput(data: SwissQRPayloadInput): QRPayloadValidation {
  const errors: string[] = [];
  const ibanResult = validateIBAN(data.creditorIBAN);
  if (!ibanResult.valid) errors.push(ibanResult.error ?? "IBAN ungültig");
  if (ibanResult.valid && ibanResult.country !== "CH" && ibanResult.country !== "LI") {
    errors.push("Swiss QR benötigt eine CH- oder LI-IBAN");
  }
  if (!data.creditorName?.trim()) errors.push("Name des Zahlungsempfängers fehlt");
  if (!data.creditorStreet?.trim()) errors.push("Strasse des Zahlungsempfängers fehlt");
  if (!data.creditorZip?.trim()) errors.push("PLZ des Zahlungsempfängers fehlt");
  if (!data.creditorCity?.trim()) errors.push("Ort des Zahlungsempfängers fehlt");
  if (!isValidCountryCode(data.creditorCountry)) errors.push("Land des Zahlungsempfängers ist ungültig");

  if (data.referenceType === "QRR") {
    if (ibanResult.accountType !== "qr_iban") errors.push("QRR erfordert eine QR-IBAN");
    if (data.currency !== "CHF") errors.push("QRR ist nur für CHF zulässig");
    if (!isValidQRReference(data.reference ?? "")) errors.push("QR-Referenz ist ungültig");
  } else {
    if (ibanResult.accountType === "qr_iban") errors.push("QR-IBAN darf nicht mit SCOR/NON kombiniert werden");
    if (data.referenceType === "SCOR" && !isValidSCORReference(data.reference ?? "")) {
      errors.push("Creditor Reference (SCOR) ist ungültig");
    }
    if (data.referenceType === "NON" && (data.reference ?? "") !== "") {
      errors.push("Bei NON darf keine strukturierte Referenz gesetzt sein");
    }
  }

  const combined = (data.message ?? "").length + (data.billingInformation ?? "").length;
  if (combined > 140) errors.push("Mitteilung und Rechnungsinformationen dürfen zusammen max. 140 Zeichen haben");

  return { valid: errors.length === 0, errors };
}

/** Format an amount the way the payment part requires: 1 234.50 */
export function formatPaymentAmount(amount: number): string {
  return new Intl.NumberFormat("de-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount).replace(/\u2019/g, " ");
}
