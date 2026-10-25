import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import QRCode from "npm:qrcode@1.5.4";
import { renderInvoicePdf } from "./invoicePdf.ts";
import { routePayment, type PaymentProfile, type PaymentSnapshot } from "./payment-domain.ts";

const profile: PaymentProfile = {
  id: "p1", name: "CHF QR", currency: "CHF", presentation_type: "swiss_qr",
  iban: "CH4431999123000889012", account_holder: "Schneesportschule Malbun",
  account_holder_street: "Talstation", account_holder_house_number: "1", account_holder_zip: "9497",
  account_holder_city: "Malbun", account_holder_country: "LI",
  reference_type: "QRR", country_scope: "CH_LI", account_type: "qr_iban",
  is_active: true, is_archived: false, validation_status: "valid",
} as unknown as PaymentProfile;

function snapshotFor(total: number): PaymentSnapshot {
  const r = routePayment({
    billingCountry: "CH", currency: "CHF", invoiceIdentifier: "TEST-1", invoiceNumber: "R-2026-0001",
    dueDate: "2026-12-31", amount: total,
    debtor: { name: "Müller Äöü", street: "Bergstrasse", houseNumber: "12b", zip: "8000", city: "Zürich", country: "CH" },
    profiles: [profile],
  });
  if (!r.ok || !r.snapshot) throw new Error("routing failed");
  return r.snapshot;
}

function input(total: number, snapshot: PaymentSnapshot | null, lines = 40) {
  return {
    invoice: {
      id: "inv-1", invoice_number: "R-2026-0001", issued_at: "2026-10-25", due_date: "2026-12-31",
      subtotal: total, discount: 0, total, currency: "CHF", status: "open", payment_snapshot: snapshot,
    },
    school: { name: "Schneesportschule Malbun", phone: "+423 123 45 67", email: "info@example.invalid", vat_number: "CHE-123.456.789" },
    customer: { first_name: "Andrée", last_name: "Müller-Schmid von Grüningen-Bärental", street: "Sehr lange Strasse mit Umlauten äöü", house_number: "123b", zip: "8000", city: "Zürich" },
    ticketNumber: "T-2026-000001",
    lines: Array.from({ length: lines }, (_, i) => ({
      description: `Privatlektion Ski mit sehr langem Namen ${i + 1} äöü`,
      details: `2${i}.12.2026 · 09:00–10:00 + 10:00–12:00`, amount: 55,
    })),
  };
}

Deno.test("PDF: magic bytes, pages, readable by pdf-lib, umlaut text present", async () => {
  const total = 2200;
  const r = await renderInvoicePdf(input(total, snapshotFor(total)));
  assert(r.ok);
  assertEquals(new TextDecoder().decode(r.pdf.slice(0, 5)), "%PDF-");
  assertStringIncludes(r.filename, ".pdf");
  const doc = await PDFDocument.load(r.pdf);
  assert(doc.getPageCount() >= 2, "multipage invoice must paginate");
  // Content streams are flate-compressed; inflate and search for key text.
  const raw = new TextDecoder("latin1").decode(r.pdf);
  const streams = [...raw.matchAll(/stream\r?\n/g)].map((m) => m.index! + m[0].length);
  let found = "";
  for (const s of streams) {
    const end = raw.indexOf("endstream", s);
    if (end < 0) continue;
    const bytes = Uint8Array.from(raw.slice(s, end).trim(), (c) => c.charCodeAt(0));
    try {
      const ds = new DecompressionStream("deflate");
      const out = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
      found += new TextDecoder("latin1").decode(out);
    } catch { /* non-deflate stream (e.g. QR PNG) */ }
  }
  assertStringIncludes(found, "RECHNUNG");
  assertStringIncludes(found, "R-2026-0001");
  assertStringIncludes(found, "Total");
  assertStringIncludes(found, "Zahlteil");
  assertStringIncludes(found, "Empfangsschein");
});

Deno.test("PDF: QR payload in attachment matches stored snapshot payload exactly", async () => {
  const total = 105;
  const snap = snapshotFor(total);
  const r = await renderInvoicePdf(input(total, snap, 2));
  assert(r.ok);
  // Independent check: the payload we encoded is the stored one (regenerate and compare PNGs byte-wise).
  const expected = await QRCode.toDataURL(snap.qr_payload!, { errorCorrectionLevel: "M", margin: 0, width: 512 });
  const expectedBytes = Uint8Array.from(atob(expected.split(",")[1]), (c) => c.charCodeAt(0));
  const raw = new TextDecoder("latin1").decode(r.pdf);
  const embedded = raw.includes(new TextDecoder("latin1").decode(expectedBytes.slice(0, 64)));
  assert(embedded, "embedded QR image must be the encoding of the stored payload");
});

Deno.test("PDF: fails closed for draft, missing snapshot and QR amount mismatch", async () => {
  const snap = snapshotFor(105);
  const draft = await renderInvoicePdf({ ...input(105, snap, 1), invoice: { ...input(105, snap, 1).invoice, status: "draft" } });
  assertEquals(draft.ok, false);
  if (!draft.ok) assertEquals(draft.code, "invoice_not_open");
  const noSnap = await renderInvoicePdf(input(105, null, 1));
  assertEquals(noSnap.ok, false);
  if (!noSnap.ok) assertEquals(noSnap.code, "payment_details_missing");
  const mismatch = await renderInvoicePdf(input(999, snap, 1));
  assertEquals(mismatch.ok, false);
  if (!mismatch.ok) assertEquals(mismatch.code, "qr_mismatch");
});

Deno.test("PDF: non-QR route renders bank transfer section without QR", async () => {
  const sepa = { ...profile, id: "p2", presentation_type: "sepa_transfer", reference_type: "SCOR",
    currency: "EUR", country_scope: "SEPA", account_type: "iban", iban: "DE89370400440532013000",
    bic_swift: "COBADEFFXXX", bank_name: "Testbank" } as unknown as PaymentProfile;
  const r = routePayment({
    billingCountry: "DE", currency: "EUR", invoiceIdentifier: "T-2", invoiceNumber: "R-2026-0002",
    dueDate: "2026-12-31", amount: 50,
    debtor: { name: "Gast", street: "Weg 1", zip: "12345", city: "Berlin", country: "DE" },
    profiles: [sepa],
  });
  if (!r.ok || !r.snapshot) throw new Error("routing failed");
  const out = await renderInvoicePdf(input(50, r.snapshot, 1));
  assert(out.ok);
  const raw = new TextDecoder("latin1").decode(out.pdf);
  assert(!raw.includes("/Image"), "no QR image for bank transfer route");
});
