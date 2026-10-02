// deno test --node-modules-dir=none --no-check --allow-env supabase/functions/_shared/swissQrBill.test.ts
// Pure rendering of the Swiss QR payment part; no network, no database.
import {
  buildQrPaymentPartHtml,
  buildQrPaymentPartText,
  hasQrCode,
  paymentPartReference,
} from "./swissQrBill.ts";
import { formatQRReference, generateQRReference, type PaymentSnapshot } from "./payment-domain.ts";

const eq = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
};

const reference = generateQRReference("R-2026-00042");

function snapshot(overrides: Partial<PaymentSnapshot> = {}): PaymentSnapshot {
  return {
    profile_id: "p1",
    profile_name: "Bankkonto Schule",
    bank_name: "Liechtensteinische Landesbank",
    account_holder: "Schneesportschule Malbun AG",
    account_holder_address: {
      street: "Dorfstrasse",
      houseNumber: "12",
      zip: "9497",
      city: "Malbun",
      country: "LI",
    },
    iban: "LI21088100000000000000",
    iban_formatted: "LI21 0881 0000 0000 0000 00",
    bic_swift: null,
    account_type: "qr_iban",
    currency: "CHF",
    reference_type: "QRR",
    reference,
    country_scope: "CH_LI",
    presentation_type: "swiss_qr",
    payment_message: "Rechnung R-2026-00042",
    due_date: "2026-10-14",
    payload_version: "0200",
    qr_payload: "SPC\r\n0200\r\n1\r\nLI21088100000000000000\r\n...",
    snapshot_created_at: "2026-09-30T20:00:00.000Z",
    ...overrides,
  };
}

const base = {
  amount: 1250.5,
  debtor: { name: "Muster AG", street: "Bergweg", houseNumber: "3", zip: "9494", city: "Schaan" },
  invoiceNumber: "R-2026-00042",
  dueDate: "14.10.2026",
};

Deno.test("payload only counts as QR code for Swiss QR invoices", () => {
  eq(hasQrCode(snapshot()), true);
  eq(hasQrCode(snapshot({ presentation_type: "international_transfer" })), false);
  eq(hasQrCode(snapshot({ qr_payload: null })), false);
  eq(hasQrCode(null), false);
});

Deno.test("reference is formatted per reference type", () => {
  eq(paymentPartReference(snapshot()).length, 32); // 27 digits in groups of 5
  eq(paymentPartReference(snapshot({ reference_type: "SCOR", reference: "RF18539007547034" })), "RF18 5390 0754 7034");
  eq(paymentPartReference(snapshot({ reference_type: "INVOICE_NUMBER", reference: "R-2026-42" })), "R-2026-42");
  eq(paymentPartReference(snapshot({ reference_type: "NON", reference: "" })), "");
});

Deno.test("HTML part contains QR image, amount, account and reference", () => {
  const html = buildQrPaymentPartHtml({ ...base, snapshot: snapshot(), qrDataUrl: "data:image/png;base64,AAA" });
  for (const expected of [
    "data:image/png;base64,AAA",
    "LI21 0881 0000 0000 0000 00",
    "Schneesportschule Malbun AG",
    "Dorfstrasse 12",
    "Zahlbar durch",
    "Muster AG",
    "Zusätzliche Informationen",
  ]) {
    if (!html.includes(expected)) throw new Error(`missing in HTML: ${expected}`);
  }
  if (!html.includes(formatQRReference(reference))) throw new Error("formatted reference missing");
  if (!/1\s?250\.50/.test(html)) throw new Error("formatted amount missing");
  if (html.includes("LI21088100000000000000")) throw new Error("unformatted IBAN leaked");
});

Deno.test("missing QR image renders a placeholder, not a broken block", () => {
  const html = buildQrPaymentPartHtml({ ...base, snapshot: snapshot(), qrDataUrl: null });
  if (html.includes("<img")) throw new Error("no image expected");
  if (!html.includes("border:1px solid #000")) throw new Error("placeholder missing");
});

Deno.test("HTML escapes customer-supplied debtor data", () => {
  const html = buildQrPaymentPartHtml({
    ...base,
    snapshot: snapshot(),
    debtor: { name: '<script>alert("x")</script>', zip: "9494", city: "Schaan & Co" },
  });
  if (html.includes("<script>")) throw new Error("debtor name was not escaped");
  if (!html.includes("&lt;script&gt;")) throw new Error("escaped debtor name missing");
  if (!html.includes("Schaan &amp; Co")) throw new Error("escaped city missing");
});

Deno.test("non-QR invoice renders without a QR code but with the account", () => {
  const html = buildQrPaymentPartHtml({
    ...base,
    snapshot: snapshot({ presentation_type: "sepa_transfer", currency: "EUR", reference_type: "SCOR", reference: "RF18539007547034", qr_payload: null }),
    qrDataUrl: null,
  });
  if (html.includes("<img")) throw new Error("SEPA invoice must not show a QR code");
  if (!html.includes("EUR")) throw new Error("currency missing");
  if (!html.includes("RF18 5390 0754 7034")) throw new Error("SCOR reference missing");
});

Deno.test("plain text alternative lists amount, account and reference", () => {
  const text = buildQrPaymentPartText({ ...base, snapshot: snapshot() });
  for (const expected of ["Betrag: CHF", "250.50", "Referenz:", "Zahlbar durch: Muster AG", "LI21 0881 0000 0000 0000 00"]) {
    if (!text.includes(expected)) throw new Error(`missing in text: ${expected}`);
  }
  if (text.includes("{{")) throw new Error("unresolved placeholder in text");
});
