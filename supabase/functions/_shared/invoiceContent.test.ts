// R1 (S1): invoice content snapshot v1 - canonical names/dates/times, one amount per lesson, frozen document.
import { assert, assertEquals, assertStringIncludes, assertThrows } from "jsr:@std/assert@1";
import { buildInvoiceContentV1, snapshotLines } from "./invoiceContent.ts";
import { renderInvoicePdf } from "./invoicePdf.ts";
import { routePayment, type PaymentProfile } from "./payment-domain.ts";

const anna = { id: "p-anna", first_name: "Anna", last_name: "Muster" };
const ben = { id: "p-ben", first_name: "Ben", last_name: "Muster" };
const teacher = { id: "t-1", first_name: "Lea", last_name: "Lehrer" };
const ski = { name: "Privatunterricht Ski" };
const appt = (id: string, date: string, s: string, e: string, instr: string | null = "t-1") =>
  ({ id, date, time_start: s, time_end: e, instructor_id: instr, meeting_point: null });
const line = (id: string, appointment_id: string | null, amount: number, more: Record<string, unknown> = {}) =>
  ({ id, appointment_id, date: "2026-12-12", time_start: "10:00:00", time_end: "12:00:00", line_total: amount, product: ski, ...more });

Deno.test("two people, one lesson: one line, both names, date/time/teacher, amount not multiplied", () => {
  const s = buildInvoiceContentV1([line("i1", "a1", 230)], [appt("a1", "2026-12-12", "10:00:00", "12:00:00")],
    [{ appointment_id: "a1", participant_id: "p-anna" }, { appointment_id: "a1", participant_id: "p-ben" }], [anna, ben], [teacher]);
  assertEquals(s.version, 1); assertEquals(s.lines.length, 1);
  assertEquals(s.lines[0].amount, 230);
  assertEquals(s.lines[0].description, "Privatunterricht Ski");
  assertEquals(s.lines[0].details, "Anna Muster, Ben Muster · Sa 12.12.2026 10:00–12:00 · Lehrperson: Lea Lehrer");
});

Deno.test("multi-day mixed cart: one line per appointment + group package + lunch, sum = stored line totals", () => {
  const items = [
    line("i1", "a1", 190), line("i2", "a2", 150, { date: "2026-12-13" }),
    { id: "g1", appointment_id: null, date: "2026-12-14", end_date: "2026-12-18", time_start: null, time_end: null, line_total: 320,
      product: { name: "26/27 Kinder Ganztag" }, participant: ben },
    { id: "l1", appointment_id: null, date: "2026-12-14", time_start: null, time_end: null, line_total: 30, item_type: "lunch",
      product: { name: "Mittagsbetreuung" }, participant: ben },
  ];
  const s = buildInvoiceContentV1(items, [appt("a1", "2026-12-12", "10:00:00", "12:00:00"), appt("a2", "2026-12-13", "12:00:00", "14:00:00", null)],
    [{ appointment_id: "a1", participant_id: "p-anna" }, { appointment_id: "a2", participant_id: "p-anna" }], [anna], [teacher],
    [{ ticket_item_ids: ["g1"], dates: ["2026-12-14", "2026-12-15"], blocks: ["10:00–12:00", "14:00–16:00"] }]);
  assertEquals(s.lines.map((l) => l.amount), [190, 150, 320, 30]);
  assertStringIncludes(s.lines[1].details!, "So 13.12.2026 12:00–14:00");
  assert(!s.lines[1].details!.includes("Lehrperson"), "unassigned lesson names no teacher");
  assertEquals(s.lines[2].details, "Ben Muster · 14.12.2026, 15.12.2026 · 10:00–12:00 + 14:00–16:00");
  assertEquals(s.lines[3].details, "Ben Muster · 14.12.2026 · Mittagsbetreuung");
});

Deno.test("incomplete canonical relationship fails closed (no frozen wrong document)", () => {
  assertThrows(() => buildInvoiceContentV1([line("i1", "a-missing", 190)], [], [], [], []), Error, "invoice_content_incomplete");
});

Deno.test("missing link / participant row / assigned teacher row fails closed; NULL teacher is fine", () => {
  const items = [line("i1", "a1", 190)];
  const ok = [{ appointment_id: "a1", participant_id: "p-anna" }];
  assertThrows(() => buildInvoiceContentV1(items, [appt("a1", "2026-12-12", "10:00:00", "12:00:00")], [], [anna], [teacher]), Error, "invoice_content_incomplete");
  assertThrows(() => buildInvoiceContentV1(items, [appt("a1", "2026-12-12", "10:00:00", "12:00:00")],
    [...ok, { appointment_id: "a1", participant_id: "p-ben" }], [anna], [teacher]), Error, "invoice_content_incomplete");
  assertThrows(() => buildInvoiceContentV1(items, [appt("a1", "2026-12-12", "10:00:00", "12:00:00")], ok, [anna], []), Error, "invoice_content_incomplete");
  const s = buildInvoiceContentV1(items, [appt("a1", "2026-12-12", "10:00:00", "12:00:00", null)], ok, [anna], []);
  assertEquals(s.lines[0].details, "Anna Muster · Sa 12.12.2026 10:00–12:00");
});

Deno.test("legacy invoice (no or unknown snapshot) => null, renderer keeps legacy lines", () => {
  assertEquals(snapshotLines(null), null); assertEquals(snapshotLines(undefined), null);
  assertEquals(snapshotLines({ version: 2, lines: [] }), null); assertEquals(snapshotLines({ lines: [] }), null);
});

Deno.test("frozen snapshot: a later booking edit cannot redraw the issued document; PDF text shows names/dates", async () => {
  const links = [{ appointment_id: "a1", participant_id: "p-anna" }, { appointment_id: "a1", participant_id: "p-ben" }];
  const frozen = JSON.parse(JSON.stringify(buildInvoiceContentV1([line("i1", "a1", 230)], [appt("a1", "2026-12-12", "10:00:00", "12:00:00")], links, [anna, ben], [teacher])));
  // Later edit: lesson moved and a person renamed. A fresh build differs, the frozen one does not change.
  const later = buildInvoiceContentV1([line("i1", "a1", 230)], [appt("a1", "2026-12-19", "14:00:00", "16:00:00")], links, [{ ...anna, first_name: "Annika" }, ben], [teacher]);
  assert(JSON.stringify(later) !== JSON.stringify(frozen));
  const profile = { id: "p1", name: "CHF QR", currency: "CHF", presentation_type: "swiss_qr", iban: "CH4431999123000889012",
    account_holder: "Schneesportschule Malbun", account_holder_street: "Talstation", account_holder_house_number: "1", account_holder_zip: "9497",
    account_holder_city: "Malbun", account_holder_country: "LI", reference_type: "QRR", country_scope: "CH_LI", account_type: "qr_iban",
    is_active: true, is_archived: false, validation_status: "valid" } as unknown as PaymentProfile;
  const r = routePayment({ billingCountry: "CH", currency: "CHF", invoiceIdentifier: "R1", invoiceNumber: "R-2026-R1", dueDate: "2026-12-31", amount: 230,
    debtor: { name: "Synth Payer", street: "Weg", houseNumber: "1", zip: "8000", city: "Zürich", country: "CH" }, profiles: [profile] });
  if (!r.ok || !r.snapshot) throw new Error("routing");
  const pdf = await renderInvoicePdf({
    invoice: { id: "inv", invoice_number: "R-2026-R1", issued_at: "2026-10-25", due_date: "2026-12-31", subtotal: 230, discount: 0, total: 230,
      currency: "CHF", status: "open", payment_snapshot: r.snapshot },
    school: { name: "Synth" }, customer: { last_name: "Payer" }, ticketNumber: "T-R1", lines: snapshotLines(frozen)!,
  });
  if (!pdf.ok) throw new Error(pdf.message);
  const file = await Deno.makeTempFile({ suffix: ".pdf" });
  await Deno.writeFile(file, pdf.pdf);
  const out = await new Deno.Command("pdftotext", { args: ["-layout", file, "-"] }).output().catch(() => null);
  if (out?.success) {
    const text = new TextDecoder().decode(out.stdout);
    assertStringIncludes(text, "Anna Muster, Ben Muster");
    assertStringIncludes(text, "12.12.2026 10:00");
    assert(!text.includes("Annika") && !text.includes("19.12.2026"), "frozen document unchanged by later edit");
    assert(!text.includes("Teilnehmer - Privatunterricht"), "no legacy placeholder line");
  } else {
    console.warn("pdftotext unavailable: PDF text not extracted");
  }
});
