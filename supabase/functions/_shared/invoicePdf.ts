/**
 * Server-side invoice PDF (A4) with the Swiss QR-bill payment part, built
 * from the SAME immutable data as invoiceDocument.ts: the issued invoice row
 * and its frozen payment_snapshot. Nothing is re-derived from mutable
 * customer/bank data. Fails closed with the same codes as the HTML renderer.
 *
 * Uses pdf-lib (pure JS, runs in the Deno Edge runtime, no external service).
 * Standard Helvetica fonts are WinAnsi-encoded and cover German umlauts.
 */
import { PDFDocument, StandardFonts, rgb, type PDFPage } from "npm:pdf-lib@1.17.1";
import QRCode from "npm:qrcode@1.5.4";
import {
  formatIBAN,
  formatPaymentAmount,
  formatQRReference,
  formatSCORReference,
  type PaymentSnapshot,
} from "./payment-domain.ts";
import type { InvoiceDocInput } from "./invoiceDocument.ts";

export type InvoicePdfResult =
  | { ok: true; pdf: Uint8Array; filename: string }
  | { ok: false; code: "payment_details_missing" | "invoice_not_open" | "qr_mismatch"; message: string };

const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 42.52; // 15 mm
const BLACK = rgb(0, 0, 0), GREY = rgb(0.33, 0.33, 0.33), LINE = rgb(0.87, 0.87, 0.87);
const mm = (v: number) => v * 2.83465;

const fmtDate = (d?: string | null) => {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}.${m}.${y}`;
};
const money = (n: number, cur: string) => `${cur} ${formatPaymentAmount(n)}`;

function reference(s: PaymentSnapshot) {
  if (s.reference_type === "QRR") return formatQRReference(s.reference);
  if (s.reference_type === "SCOR") return formatSCORReference(s.reference);
  return "";
}

/** WinAnsi-safe: replace characters the standard fonts cannot encode. */
const safe = (s: unknown) => String(s ?? "").replace(/[^\x20-\x7E\xA0-\xFF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u20AC]/g, "?");

interface Ctx { doc: PDFDocument; page: PDFPage; y: number; font: any; bold: any }

function line(ctx: Ctx, text: string, opts: { size?: number; bold?: boolean; x?: number; gap?: number; grey?: boolean } = {}) {
  const size = opts.size ?? 10;
  if (ctx.y < MARGIN + 30) newPage(ctx);
  ctx.page.drawText(safe(text), {
    x: opts.x ?? MARGIN, y: ctx.y, size, font: opts.bold ? ctx.bold : ctx.font,
    color: opts.grey ? GREY : BLACK,
  });
  ctx.y -= opts.gap ?? size + 4;
}

function newPage(ctx: Ctx) {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - MARGIN;
}

/** Word-wrap within width; returns drawn line count. */
function wrapped(ctx: Ctx, text: string, width: number, opts: { size?: number; bold?: boolean; grey?: boolean } = {}) {
  const size = opts.size ?? 10;
  const font = opts.bold ? ctx.bold : ctx.font;
  for (const para of safe(text).split("\n")) {
    let rest = para;
    while (rest) {
      let end = rest.length;
      while (end > 0 && font.widthOfTextAtSize(rest.slice(0, end), size) > width) {
        const sp = rest.lastIndexOf(" ", end - 1);
        end = sp > 0 ? sp : end - 1;
      }
      if (end <= 0) end = rest.length;
      line(ctx, rest.slice(0, end).trimEnd(), { ...opts, size });
      rest = rest.slice(end).trimStart();
    }
  }
}

export async function renderInvoicePdf(input: InvoiceDocInput): Promise<InvoicePdfResult> {
  const { invoice, school, customer } = input;
  if (invoice.status !== "open") return { ok: false, code: "invoice_not_open", message: `Rechnung hat Status ${invoice.status}` };
  const s = invoice.payment_snapshot;
  if (!s || !s.iban || !s.account_holder || !s.presentation_type) {
    return { ok: false, code: "payment_details_missing", message: "Rechnung ohne Zahlungsdaten (Zahlungsprofil/Snapshot fehlt)" };
  }
  const currency = (invoice.currency ?? s.currency ?? "CHF").toUpperCase();
  const total = Number(invoice.total);
  const isQr = s.presentation_type === "swiss_qr";

  let qrPng: Uint8Array | null = null;
  if (isQr) {
    if (!s.qr_payload) return { ok: false, code: "payment_details_missing", message: "QR-Zahlteil fehlt im Snapshot" };
    const l = s.qr_payload.split("\r\n");
    // SPC v0200: [18]=amount, [19]=currency.
    if (l[0] !== "SPC" || Number(l[18]) !== total || l[19] !== currency) {
      return { ok: false, code: "qr_mismatch", message: "QR-Zahlteil passt nicht zu Betrag/Währung der Rechnung" };
    }
    const dataUrl = await QRCode.toDataURL(s.qr_payload, { errorCorrectionLevel: "M", margin: 0, width: 512 });
    const bin = atob(dataUrl.split(",")[1]);
    qrPng = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  }

  const a = s.account_holder_address;
  const custName = [customer.first_name, customer.last_name].filter(Boolean).join(" ");
  const custAddr = [[customer.street, customer.house_number].filter(Boolean).join(" "), [customer.zip, customer.city].filter(Boolean).join(" ")].filter(Boolean);
  const credAddr = [[a.street, a.houseNumber].filter(Boolean).join(" "), [a.zip, a.city].filter(Boolean).join(" ")].filter(Boolean);
  const ref = reference(s);

  const doc = await PDFDocument.create();
  doc.setTitle(`Rechnung ${invoice.invoice_number}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { doc, page: doc.addPage([PAGE_W, PAGE_H]), y: 0, font, bold };
  ctx.y = PAGE_H - MARGIN;

  // Creditor header
  line(ctx, s.account_holder || school.name, { size: 16, bold: true, gap: 22 });
  for (const l of [...credAddr, school.phone ? `Tel: ${school.phone}` : "", school.email ?? "", school.website ?? ""].filter(Boolean)) {
    line(ctx, l, { size: 9, grey: true, gap: 12 });
  }
  ctx.y -= 26;

  // Customer address
  line(ctx, custName, { size: 10 });
  for (const l of custAddr) line(ctx, l, { size: 10 });
  ctx.y -= 26;

  // Invoice meta
  line(ctx, "RECHNUNG", { size: 14, bold: true, gap: 20 });
  line(ctx, `Rechnungsnummer: ${invoice.invoice_number}`, { size: 10 });
  line(ctx, `Rechnungsdatum: ${fmtDate(invoice.issued_at)}`, { size: 10 });
  line(ctx, `Buchung: ${input.ticketNumber}`, { size: 10 });
  line(ctx, `Zahlbar bis: ${fmtDate(invoice.due_date)}`, { size: 10 });
  ctx.y -= 18;

  // Line items table
  const amountX = PAGE_W - MARGIN;
  const descW = PAGE_W - 2 * MARGIN - 110;
  const drawRow = (desc: string, details: string | undefined, amount: string, strong = false) => {
    if (ctx.y < MARGIN + 60) newPage(ctx);
    const o = { size: 10, bold: strong };
    const yBefore = ctx.y;
    ctx.y = yBefore;
    // description (wrapped) on the left, amount right-aligned
    const savedY = ctx.y;
    wrapped(ctx, desc, descW, o);
    if (details) wrapped(ctx, details, descW, { size: 8, grey: true });
    ctx.page.drawText(safe(amount), {
      x: amountX - (strong ? bold : font).widthOfTextAtSize(safe(amount), 10), y: savedY, size: 10,
      font: strong ? bold : font,
    });
    ctx.page.drawLine({ start: { x: MARGIN, y: ctx.y + 2 }, end: { x: PAGE_W - MARGIN, y: ctx.y + 2 }, thickness: 0.5, color: LINE });
    ctx.y -= 8;
  };

  for (const l of input.lines) drawRow(l.description, l.details, money(l.amount, currency));
  const discount = Number(invoice.discount ?? 0);
  drawRow("Zwischensumme", undefined, money(Number(invoice.subtotal), currency));
  if (discount) drawRow("Rabatt", undefined, `-${money(discount, currency)}`);
  drawRow("Total", undefined, money(total, currency), true);
  if (school.vat_number) line(ctx, `MWST-Nr. ${school.vat_number}`, { size: 8, grey: true });

  // Payment part
  if (isQr && qrPng) {
    // Swiss QR bill section on its own page area (105 mm high)
    if (ctx.y < MARGIN + mm(105) + 20) newPage(ctx);
    const top = ctx.y - 10;
    const receiptW = mm(62);
    ctx.page.drawLine({ start: { x: MARGIN, y: top }, end: { x: PAGE_W - MARGIN, y: top }, thickness: 0.7, color: BLACK, dashArray: [3, 3] });
    ctx.page.drawLine({ start: { x: MARGIN + receiptW, y: top }, end: { x: MARGIN + receiptW, y: top - mm(105) }, thickness: 0.7, color: BLACK, dashArray: [3, 3] });

    const rx = MARGIN + 6, px = MARGIN + receiptW + 10;
    let ry = top - 16, py = top - 16;
    const receiptW2 = receiptW - 12;
    const rline = (t: string, o: { size?: number; bold?: boolean } = {}) => {
      const size = o.size ?? 8, f = o.bold ? bold : font;
      let rest = safe(t);
      while (rest) {
        let end = rest.length;
        while (end > 0 && f.widthOfTextAtSize(rest.slice(0, end), size) > receiptW2) {
          const sp = rest.lastIndexOf(" ", end - 1);
          end = sp > 0 ? sp : end - 1;
        }
        if (end <= 0) end = rest.length;
        ctx.page.drawText(rest.slice(0, end).trimEnd(), { x: rx, y: ry, size, font: f });
        ry -= size + 3.5;
        rest = rest.slice(end).trimStart();
      }
    };
    const pline = (t: string, o: { size?: number; bold?: boolean } = {}) => { ctx.page.drawText(safe(t), { x: px, y: py, size: o.size ?? 8, font: o.bold ? bold : font }); py -= (o.size ?? 8) + 3.5; };

    rline("Empfangsschein", { size: 11, bold: true }); ry -= 4;
    rline("Konto / Zahlbar an", { bold: true, size: 6 });
    rline(formatIBAN(s.iban)); rline(s.account_holder);
    for (const l of credAddr) rline(l);
    if (ref) { ry -= 3; rline("Referenz", { bold: true, size: 6 }); rline(ref); }
    ry -= 3; rline("Zahlbar durch", { bold: true, size: 6 });
    rline(custName); for (const l of custAddr) rline(l);
    ry -= 3; rline("Währung / Betrag", { bold: true, size: 6 });
    rline(`${currency} ${formatPaymentAmount(total)}`);

    pline("Zahlteil", { size: 11, bold: true }); py -= 4;
    const qrSize = mm(46);
    const qrImg = await doc.embedPng(qrPng);
    const qrX = px, qrY = py - qrSize;
    ctx.page.drawImage(qrImg, { x: qrX, y: qrY, width: qrSize, height: qrSize });
    // Official Swiss cross overlay (7x7 mm), drawn as vectors.
    const c = qrSize * (7 / 46), o = (qrSize - c) / 2, bar = c * 0.6 / 3.2;
    ctx.page.drawRectangle({ x: qrX + o, y: qrY + o, width: c, height: c, color: rgb(1, 1, 1) });
    ctx.page.drawRectangle({ x: qrX + o + c * 0.08, y: qrY + o + c * 0.08, width: c * 0.84, height: c * 0.84, color: BLACK });
    ctx.page.drawRectangle({ x: qrX + qrSize / 2 - bar / 2, y: qrY + o + c * 0.25, width: bar, height: c * 0.5, color: rgb(1, 1, 1) });
    ctx.page.drawRectangle({ x: qrX + o + c * 0.25, y: qrY + qrSize / 2 - bar / 2, width: c * 0.5, height: bar, color: rgb(1, 1, 1) });
    py = qrY - 14;

    pline("Konto / Zahlbar an", { bold: true, size: 6 });
    pline(formatIBAN(s.iban)); pline(s.account_holder);
    if (ref) { py -= 3; pline("Referenz", { bold: true, size: 6 }); pline(ref); }
    py -= 3; pline("Zusätzliche Informationen", { bold: true, size: 6 });
    pline(`${s.payment_message || `Rechnung ${invoice.invoice_number}`} · zahlbar bis ${fmtDate(invoice.due_date)}`);
    py -= 3; pline("Währung / Betrag", { bold: true, size: 6 });
    pline(`${currency} ${formatPaymentAmount(total)}`);
  } else {
    ctx.y -= 16;
    line(ctx, "Zahlung per Banküberweisung", { size: 12, bold: true, gap: 18 });
    line(ctx, `Kontoinhaber: ${s.account_holder}`, { size: 10 });
    line(ctx, `IBAN: ${formatIBAN(s.iban)}`, { size: 10 });
    if (s.bic_swift) line(ctx, `BIC: ${s.bic_swift}`, { size: 10 });
    if (s.bank_name) line(ctx, `Bank: ${s.bank_name}`, { size: 10 });
    line(ctx, `Verwendungszweck: ${ref || s.reference || invoice.invoice_number}`, { size: 10 });
    line(ctx, `Betrag: ${money(total, currency)}`, { size: 10, bold: true });
  }

  return { ok: true, pdf: await doc.save(), filename: `Rechnung-${invoice.invoice_number}.pdf` };
}
