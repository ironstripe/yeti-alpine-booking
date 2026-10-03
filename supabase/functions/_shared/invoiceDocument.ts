/**
 * Server-side invoice document (HTML, A4, printable) with the Swiss QR-bill
 * payment part, built from the SAME immutable data the office invoice print
 * view uses: the issued invoice row and its payment_snapshot (qr_payload,
 * creditor, reference). Nothing is re-derived from mutable customer/bank data.
 *
 * Fails closed: without a valid issued snapshot (or with a QR amount/currency
 * that differs from the invoice) no document is produced, so no invoice email
 * can go out with missing or wrong payment details.
 */
import QRCode from "npm:qrcode@1.5.4";
import {
  formatIBAN,
  formatPaymentAmount,
  formatQRReference,
  formatSCORReference,
  type PaymentSnapshot,
} from "./payment-domain.ts";

export interface InvoiceDocInput {
  invoice: {
    id: string;
    invoice_number: string;
    issued_at: string | null;
    due_date: string;
    subtotal: number;
    discount: number | null;
    total: number;
    currency: string | null;
    status: string;
    payment_snapshot: PaymentSnapshot | null;
  };
  school: { name: string; phone?: string | null; email?: string | null; website?: string | null; vat_number?: string | null };
  customer: { first_name?: string | null; last_name: string; street?: string | null; house_number?: string | null; zip?: string | null; city?: string | null };
  ticketNumber: string;
  lines: Array<{ description: string; details?: string; amount: number }>;
}

export type InvoiceDocResult =
  | { ok: true; html: string; qrSvg: string | null; filename: string }
  | { ok: false; code: "payment_details_missing" | "invoice_not_open" | "qr_mismatch"; message: string };

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
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

// Official Swiss cross (7x7 mm on a 46x46 mm code), overlaid centrally.
function withSwissCross(svg: string): string {
  const m = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
  if (!m) return svg;
  const size = Number(m[1]);
  const c = size * (7 / 46), o = (size - c) / 2, bar = c * 0.6 / 3.2;
  const cross = `<g><rect x="${o}" y="${o}" width="${c}" height="${c}" fill="#fff"/>` +
    `<rect x="${o + c * 0.08}" y="${o + c * 0.08}" width="${c * 0.84}" height="${c * 0.84}" fill="#000"/>` +
    `<rect x="${size / 2 - bar / 2}" y="${o + c * 0.25}" width="${bar}" height="${c * 0.5}" fill="#fff"/>` +
    `<rect x="${o + c * 0.25}" y="${size / 2 - bar / 2}" width="${c * 0.5}" height="${bar}" fill="#fff"/></g>`;
  return svg.replace("</svg>", `${cross}</svg>`);
}

export async function renderInvoiceDocument(input: InvoiceDocInput): Promise<InvoiceDocResult> {
  const { invoice, school, customer } = input;
  if (invoice.status !== "open") return { ok: false, code: "invoice_not_open", message: `Rechnung hat Status ${invoice.status}` };
  const s = invoice.payment_snapshot;
  if (!s || !s.iban || !s.account_holder || !s.presentation_type) {
    return { ok: false, code: "payment_details_missing", message: "Rechnung ohne Zahlungsdaten (Zahlungsprofil/Snapshot fehlt)" };
  }
  const currency = (invoice.currency ?? s.currency ?? "CHF").toUpperCase();
  const total = Number(invoice.total);

  let qrSvg: string | null = null;
  if (s.presentation_type === "swiss_qr") {
    if (!s.qr_payload) return { ok: false, code: "payment_details_missing", message: "QR-Zahlteil fehlt im Snapshot" };
    const l = s.qr_payload.split("\r\n");
    // SPC v0200: [18]=amount, [19]=currency.
    if (l[0] !== "SPC" || Number(l[18]) !== total || l[19] !== currency) {
      return { ok: false, code: "qr_mismatch", message: "QR-Zahlteil passt nicht zu Betrag/Währung der Rechnung" };
    }
    qrSvg = withSwissCross(await QRCode.toString(s.qr_payload, { type: "svg", errorCorrectionLevel: "M", margin: 0 }));
  }

  const a = s.account_holder_address;
  const custName = [customer.first_name, customer.last_name].filter(Boolean).join(" ");
  const ref = reference(s);
  const rows = input.lines.map((x) =>
    `<tr><td>${esc(x.description)}${x.details ? `<div class="d">${esc(x.details)}</div>` : ""}</td><td class="r">${esc(money(x.amount, currency))}</td></tr>`
  ).join("");
  const discount = Number(invoice.discount ?? 0);

  const payment = s.presentation_type === "swiss_qr"
    ? `<section class="qr-bill"><div class="rc"><h3>Empfangsschein</h3>
        <p class="l">Konto / Zahlbar an</p><p>${esc(formatIBAN(s.iban))}<br>${esc(s.account_holder)}<br>${esc([a.street, a.houseNumber].filter(Boolean).join(" "))}<br>${esc([a.zip, a.city].filter(Boolean).join(" "))}</p>
        ${ref ? `<p class="l">Referenz</p><p>${esc(ref)}</p>` : ""}
        <p class="l">Zahlbar durch</p><p>${esc(custName)}<br>${esc([customer.street, customer.house_number].filter(Boolean).join(" "))}<br>${esc([customer.zip, customer.city].filter(Boolean).join(" "))}</p>
        <p class="l">Währung / Betrag</p><p>${esc(currency)} ${esc(formatPaymentAmount(total))}</p></div>
       <div class="pp"><h3>Zahlteil</h3><div class="qr">${qrSvg}</div>
        <p class="l">Konto / Zahlbar an</p><p>${esc(formatIBAN(s.iban))}<br>${esc(s.account_holder)}</p>
        ${ref ? `<p class="l">Referenz</p><p>${esc(ref)}</p>` : ""}
        <p class="l">Zusätzliche Informationen</p><p>${esc(s.payment_message || `Rechnung ${invoice.invoice_number}`)} · zahlbar bis ${esc(fmtDate(invoice.due_date))}</p>
        <p class="l">Währung / Betrag</p><p>${esc(currency)} ${esc(formatPaymentAmount(total))}</p></div></section>`
    : `<section class="bank"><h3>Zahlung per Banküberweisung</h3>
        <p>Kontoinhaber: ${esc(s.account_holder)}<br>IBAN: ${esc(formatIBAN(s.iban))}${s.bic_swift ? `<br>BIC: ${esc(s.bic_swift)}` : ""}${s.bank_name ? `<br>Bank: ${esc(s.bank_name)}` : ""}<br>
        Verwendungszweck: ${esc(ref || s.reference || invoice.invoice_number)}<br>Betrag: ${esc(money(total, currency))}</p></section>`;

  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Rechnung ${esc(invoice.invoice_number)}</title>
<style>@page{size:A4;margin:0}body{font-family:Helvetica,Arial,sans-serif;margin:0;color:#000}
.body{padding:15mm}h1{font-size:20pt;margin:0}table{width:100%;border-collapse:collapse}td{padding:4px 0;border-bottom:1px solid #ddd;vertical-align:top}
.r{text-align:right;white-space:nowrap}.d{font-size:9pt;color:#555}.l{font-size:7pt;font-weight:bold;margin:6px 0 0}
.qr-bill{display:flex;width:210mm;height:105mm;border-top:1px dashed #000;break-inside:avoid;font-size:9pt}
.rc{width:62mm;padding:5mm;border-right:1px dashed #000}.pp{flex:1;padding:5mm}.qr svg{width:46mm;height:46mm}
.bank{padding:15mm}</style></head><body><div class="body">
<header><h1>${esc(s.account_holder || school.name)}</h1>
<p>${esc([a.street, a.houseNumber].filter(Boolean).join(" "))}<br>${esc([a.zip, a.city].filter(Boolean).join(" "))}${school.phone ? `<br>Tel: ${esc(school.phone)}` : ""}${school.email ? `<br>${esc(school.email)}` : ""}</p></header>
<p>${esc(custName)}<br>${esc([customer.street, customer.house_number].filter(Boolean).join(" "))}<br>${esc([customer.zip, customer.city].filter(Boolean).join(" "))}</p>
<h2>RECHNUNG</h2>
<p>Rechnungsnummer: ${esc(invoice.invoice_number)}<br>Rechnungsdatum: ${esc(fmtDate(invoice.issued_at))}<br>Buchung: ${esc(input.ticketNumber)}<br>Zahlbar bis: ${esc(fmtDate(invoice.due_date))}</p>
<table><tbody>${rows}
<tr><td>Zwischensumme</td><td class="r">${esc(money(Number(invoice.subtotal), currency))}</td></tr>
${discount ? `<tr><td>Rabatt</td><td class="r">-${esc(money(discount, currency))}</td></tr>` : ""}
<tr><td><strong>Total</strong></td><td class="r"><strong>${esc(money(total, currency))}</strong></td></tr></tbody></table>
${school.vat_number ? `<p class="d">MWST-Nr. ${esc(school.vat_number)}</p>` : ""}
</div>${payment}</body></html>`;

  return { ok: true, html, qrSvg, filename: `Rechnung-${invoice.invoice_number}.html` };
}
