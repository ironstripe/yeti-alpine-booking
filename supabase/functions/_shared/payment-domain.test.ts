import { describe, expect, it } from "bun:test";
import {
  buildSwissQRPayload,
  determinePresentation,
  findCompatibleProfiles,
  formatQRReference,
  generateQRReference,
  generateSCORReference,
  isValidQRReference,
  isValidSCORReference,
  mod10Recursive,
  normalizeIBAN,
  routePayment,
  validateIBAN,
  validatePaymentProfile,
  validateSwissQRPayloadInput,
  type PaymentProfile,
} from "./payment-domain.ts";

// Test IBANs (checksum-valid, fictional accounts).
const QR_IBAN_LI = "LI6830172ABCDEFGHIJ2"; // placeholder replaced below
const CH_QR_IBAN = "CH4431999123000889012";
const CH_NORMAL_IBAN = "CH9300762011623852957";
const LI_NORMAL_IBAN = "LI2108800000021019826";
const DE_IBAN = "DE89370400440532013000";

function profile(overrides: Partial<PaymentProfile> = {}): PaymentProfile {
  return {
    id: overrides.id ?? "p1",
    name: "Testprofil",
    presentation_type: "swiss_qr",
    bank_name: "Testbank",
    account_holder: "Skischule Yeti",
    iban: CH_QR_IBAN,
    bic_swift: "TESTCH22",
    account_holder_street: "Dorfstrasse",
    account_holder_house_number: "1",
    account_holder_zip: "9490",
    account_holder_city: "Vaduz",
    account_holder_country: "LI",
    currency: "CHF",
    reference_type: "QRR",
    country_scope: "CH_LI",
    account_type: "qr_iban",
    is_default: true,
    is_active: true,
    is_archived: false,
    validation_status: "valid",
    ...overrides,
  };
}

const qrProfile = profile();
const chfNormalProfile = profile({
  id: "p2", iban: CH_NORMAL_IBAN, account_type: "iban", reference_type: "SCOR", is_default: false,
});
const eurSwissProfile = profile({
  id: "p3", iban: LI_NORMAL_IBAN, account_type: "iban", reference_type: "SCOR",
  currency: "EUR", is_default: true,
});
const sepaProfile = profile({
  id: "p4", presentation_type: "sepa_transfer", country_scope: "SEPA", currency: "EUR",
  iban: DE_IBAN, account_type: "iban", reference_type: "SCOR", account_holder_country: "DE",
});
const intlProfile = profile({
  id: "p5", presentation_type: "international_transfer", country_scope: "INTERNATIONAL",
  currency: "CHF", iban: CH_NORMAL_IBAN, account_type: "iban", reference_type: "INVOICE_NUMBER",
});

const ALL = [qrProfile, chfNormalProfile, eurSwissProfile, sepaProfile, intlProfile];

describe("IBAN validation", () => {
  it("accepts a valid CH IBAN", () => {
    const r = validateIBAN("CH93 0076 2011 6238 5295 7");
    expect(r.valid).toBe(true);
    expect(r.accountType).toBe("iban");
  });
  it("detects a QR-IBAN via QR-IID range", () => {
    const r = validateIBAN(CH_QR_IBAN);
    expect(r.valid).toBe(true);
    expect(r.accountType).toBe("qr_iban");
    expect(r.qrIid).toBe("31999");
  });
  it("rejects an invalid checksum", () => {
    expect(validateIBAN("CH9300762011623852958").valid).toBe(false);
  });
  it("rejects a wrong length for CH", () => {
    expect(validateIBAN("CH930076201162385295").valid).toBe(false);
  });
  it("normalizes spaces and case", () => {
    expect(normalizeIBAN(" ch93 0076 ")).toBe("CH930076");
  });
});

describe("QRR references", () => {
  it("generates a 27 digit reference with valid check digit", () => {
    const ref = generateQRReference("R-2026-00042");
    expect(ref).toHaveLength(27);
    expect(isValidQRReference(ref)).toBe(true);
    expect(ref.endsWith(mod10Recursive(ref.slice(0, 26)))).toBe(true);
  });
  it("is deterministic", () => {
    expect(generateQRReference("R-2026-00042")).toBe(generateQRReference("R-2026-00042"));
  });
  it("differs per invoice", () => {
    expect(generateQRReference("R-2026-00042")).not.toBe(generateQRReference("R-2026-00043"));
  });
  it("works from a uuid identifier", () => {
    const ref = generateQRReference("b3f1c0de-0000-4000-8000-000000000001");
    expect(isValidQRReference(ref)).toBe(true);
  });
  it("rejects an all-zero reference", () => {
    expect(isValidQRReference("0".repeat(27))).toBe(false);
  });
  it("formats in groups", () => {
    expect(formatQRReference("210000000003139471430009017").split(" ")).toHaveLength(6);
  });
});

describe("SCOR references", () => {
  it("generates a valid RF reference", () => {
    const ref = generateSCORReference("R-2026-00042");
    expect(ref.startsWith("RF")).toBe(true);
    expect(isValidSCORReference(ref)).toBe(true);
    expect(ref.length).toBeLessThanOrEqual(25);
  });
  it("validates the official example RF18539007547034", () => {
    expect(isValidSCORReference("RF18539007547034")).toBe(true);
  });
  it("rejects a broken check digit", () => {
    expect(isValidSCORReference("RF19539007547034")).toBe(false);
  });
});

describe("profile validation", () => {
  it("blocks normal IBAN + QRR", () => {
    const r = validatePaymentProfile(profile({ iban: CH_NORMAL_IBAN, account_type: "iban", reference_type: "QRR" }));
    expect(r.valid).toBe(false);
    expect(r.errors.join(" ")).toContain("QRR");
  });
  it("blocks QR-IBAN + SCOR", () => {
    const r = validatePaymentProfile(profile({ reference_type: "SCOR" }));
    expect(r.valid).toBe(false);
  });
  it("blocks an invalid checksum", () => {
    expect(validatePaymentProfile(profile({ iban: "CH9300762011623852958" })).valid).toBe(false);
  });
  it("accepts a correct QR profile", () => {
    expect(validatePaymentProfile(qrProfile).valid).toBe(true);
  });
});

describe("routing", () => {
  const base = { invoiceIdentifier: "R-2026-00042", invoiceNumber: "R-2026-00042", profiles: ALL, amount: 250 };

  it("LI + CHF -> Swiss QR with QRR", () => {
    const r = routePayment({ ...base, billingCountry: "LI", currency: "CHF" });
    expect(r.ok).toBe(true);
    expect(r.presentation_type).toBe("swiss_qr");
    expect(r.reference_type).toBe("QRR");
    expect(isValidQRReference(r.reference!)).toBe(true);
  });
  it("CH + CHF -> Swiss QR with QRR", () => {
    const r = routePayment({ ...base, billingCountry: "CH", currency: "CHF" });
    expect(r.presentation_type).toBe("swiss_qr");
    expect(r.reference_type).toBe("QRR");
  });
  it("LI + CHF with only a normal IBAN -> SCOR, never QRR", () => {
    const r = routePayment({ ...base, billingCountry: "LI", currency: "CHF", profiles: [chfNormalProfile] });
    expect(r.reference_type).toBe("SCOR");
    expect(r.snapshot!.qr_payload).toContain("SCOR");
  });
  it("LI + EUR -> Swiss QR with normal IBAN + SCOR", () => {
    const r = routePayment({ ...base, billingCountry: "LI", currency: "EUR" });
    expect(r.ok).toBe(true);
    expect(r.snapshot!.account_type).toBe("iban");
    expect(r.reference_type).toBe("SCOR");
  });
  it("LI + EUR never selects a QR-IBAN profile", () => {
    const eurQr = profile({ id: "bad", currency: "EUR", reference_type: "QRR" });
    const list = findCompatibleProfiles([eurQr], "swiss_qr", "EUR");
    expect(list).toHaveLength(0);
  });
  it("DE + EUR -> SEPA, no Swiss QR", () => {
    const r = routePayment({ ...base, billingCountry: "DE", currency: "EUR" });
    expect(r.presentation_type).toBe("sepa_transfer");
    expect(r.snapshot!.qr_payload).toBeNull();
  });
  it("AT + CHF -> international", () => {
    const r = routePayment({ ...base, billingCountry: "AT", currency: "CHF" });
    expect(r.presentation_type).toBe("international_transfer");
    expect(r.snapshot!.qr_payload).toBeNull();
  });
  it("US + CHF -> international", () => {
    expect(determinePresentation("US", "CHF")).toBe("international_transfer");
  });
  it("missing billing country blocks issuance", () => {
    const r = routePayment({ ...base, billingCountry: null, currency: "CHF" });
    expect(r.ok).toBe(false);
    expect(r.error_code).toBe("MISSING_BILLING_COUNTRY");
  });
  it("invalid country code blocks issuance", () => {
    expect(routePayment({ ...base, billingCountry: "Schweiz", currency: "CHF" }).ok).toBe(false);
  });
  it("no compatible profile blocks issuance with a German message", () => {
    const r = routePayment({ ...base, billingCountry: "DE", currency: "EUR", profiles: [qrProfile] });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Kein aktives");
  });
  it("archived profiles cannot be selected", () => {
    const r = routePayment({ ...base, billingCountry: "LI", currency: "CHF", profiles: [profile({ is_archived: true })] });
    expect(r.ok).toBe(false);
  });
  it("draft profiles cannot be selected", () => {
    const r = routePayment({ ...base, billingCountry: "LI", currency: "CHF", profiles: [profile({ validation_status: "draft", is_active: false })] });
    expect(r.ok).toBe(false);
  });
  it("override must be compatible", () => {
    const r = routePayment({ ...base, billingCountry: "LI", currency: "CHF", overrideProfileId: sepaProfile.id, overrideReason: "x" });
    expect(r.error_code).toBe("INCOMPATIBLE_OVERRIDE");
  });
  it("override requires a reason", () => {
    const r = routePayment({ ...base, billingCountry: "LI", currency: "CHF", overrideProfileId: chfNormalProfile.id });
    expect(r.error_code).toBe("OVERRIDE_REASON_REQUIRED");
  });
  it("valid override is applied and reasoned", () => {
    const r = routePayment({ ...base, billingCountry: "LI", currency: "CHF", overrideProfileId: chfNormalProfile.id, overrideReason: "Kunde wünscht SCOR" });
    expect(r.profile!.id).toBe(chfNormalProfile.id);
    expect(r.routing_reason).toContain("Manuell");
  });
  it("split lessons route independently", () => {
    const a = routePayment({ ...base, invoiceIdentifier: "R-1", billingCountry: "LI", currency: "CHF" });
    const b = routePayment({ ...base, invoiceIdentifier: "R-2", billingCountry: "DE", currency: "EUR" });
    expect(a.presentation_type).toBe("swiss_qr");
    expect(b.presentation_type).toBe("sepa_transfer");
    expect(a.reference).not.toBe(b.reference);
  });
  it("repeated routing for the same invoice yields the same reference", () => {
    const a = routePayment({ ...base, billingCountry: "LI", currency: "CHF" });
    const b = routePayment({ ...base, billingCountry: "LI", currency: "CHF" });
    expect(a.reference).toBe(b.reference);
  });
});

describe("Swiss QR payload", () => {
  const payloadInput = {
    creditorIBAN: CH_QR_IBAN,
    creditorName: "Skischule Yeti",
    creditorStreet: "Dorfstrasse",
    creditorHouseNumber: "1",
    creditorZip: "9490",
    creditorCity: "Vaduz",
    creditorCountry: "LI",
    amount: 199.9,
    currency: "CHF" as const,
    debtorName: "Anna Muster",
    debtorStreet: "Bahnhofstrasse",
    debtorHouseNumber: "12",
    debtorZip: "8001",
    debtorCity: "Zürich",
    debtorCountry: "CH",
    referenceType: "QRR" as const,
    reference: generateQRReference("R-2026-00042"),
    message: "Rechnung R-2026-00042",
  };

  it("emits the exact SIX line sequence with address type S", () => {
    const lines = buildSwissQRPayload(payloadInput).split("\r\n");
    expect(lines[0]).toBe("SPC");
    expect(lines[1]).toBe("0200");
    expect(lines[2]).toBe("1");
    expect(lines[3]).toBe(CH_QR_IBAN);
    expect(lines[4]).toBe("S");
    expect(lines[5]).toBe("Skischule Yeti");
    expect(lines[6]).toBe("Dorfstrasse");
    expect(lines[7]).toBe("1");
    expect(lines[8]).toBe("9490");
    expect(lines[9]).toBe("Vaduz");
    expect(lines[10]).toBe("LI");
    expect(lines.slice(11, 18)).toEqual(["", "", "", "", "", "", ""]);
    expect(lines[18]).toBe("199.90");
    expect(lines[19]).toBe("CHF");
    expect(lines[20]).toBe("S");
    expect(lines[26]).toBe("CH");
    expect(lines[27]).toBe("QRR");
    expect(lines[28]).toBe(payloadInput.reference);
    expect(lines[29]).toBe("Rechnung R-2026-00042");
    expect(lines[30]).toBe("EPD");
    expect(lines).toHaveLength(31);
    expect(lines).not.toContain("K");
  });

  it("omits the debtor block when the address is incomplete", () => {
    const lines = buildSwissQRPayload({ ...payloadInput, debtorZip: undefined }).split("\r\n");
    expect(lines.slice(20, 27)).toEqual(["", "", "", "", "", "", ""]);
  });

  it("leaves the reference empty for NON", () => {
    const lines = buildSwissQRPayload({
      ...payloadInput, creditorIBAN: CH_NORMAL_IBAN, referenceType: "NON", reference: "",
    }).split("\r\n");
    expect(lines[27]).toBe("NON");
    expect(lines[28]).toBe("");
  });

  it("blocks normal IBAN + QRR", () => {
    const r = validateSwissQRPayloadInput({ ...payloadInput, creditorIBAN: CH_NORMAL_IBAN });
    expect(r.valid).toBe(false);
  });

  it("blocks QR-IBAN + SCOR", () => {
    const r = validateSwissQRPayloadInput({ ...payloadInput, referenceType: "SCOR", reference: generateSCORReference("R-1") });
    expect(r.valid).toBe(false);
  });

  it("blocks QRR in EUR", () => {
    const r = validateSwissQRPayloadInput({ ...payloadInput, currency: "EUR" });
    expect(r.errors.join(" ")).toContain("CHF");
  });

  it("accepts a complete QRR payload", () => {
    expect(validateSwissQRPayloadInput(payloadInput).valid).toBe(true);
  });

  it("blocks incomplete creditor data", () => {
    expect(validateSwissQRPayloadInput({ ...payloadInput, creditorStreet: "" }).valid).toBe(false);
  });
});
