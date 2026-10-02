/**
 * Swiss QR payment part for the invoice email (B+ Phase 2).
 *
 * The payment part is rendered exclusively from the invoice's immutable payment
 * snapshot (`invoices.payment_snapshot`), which was written when the invoice was
 * issued. Nothing is recomputed from customer input, so what the customer
 * receives always equals what is stored and audited.
 *
 * The e-mail block uses inline styles only (no external stylesheet, no script,
 * no hosted image) so it renders in every common mail client. The QR code
 * arrives as an inline PNG data URL and additionally as a PNG attachment.
 */
import {
  formatIBAN,
  formatPaymentAmount,
  formatQRReference,
  formatSCORReference,
  type PaymentSnapshot,
} from "./payment-domain.ts";

export interface QrPaymentPartDebtor {
  name?: string | null;
  street?: string | null;
  houseNumber?: string | null;
  zip?: string | null;
  city?: string | null;
}

export interface QrPaymentPartInput {
  snapshot: PaymentSnapshot;
  amount: number;
  debtor?: QrPaymentPartDebtor | null;
  invoiceNumber?: string | null;
  dueDate?: string | null;
  /** PNG data URL of the QR code. When missing, the part renders without image. */
  qrDataUrl?: string | null;
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ESCAPES[c]!);

/** The QR code is only meaningful for a Swiss QR invoice with a payload. */
export function hasQrCode(snapshot: PaymentSnapshot | null | undefined): boolean {
  return snapshot?.presentation_type === "swiss_qr" && !!snapshot.qr_payload;
}

/** Human readable payment reference as printed on the payment part. */
export function paymentPartReference(snapshot: PaymentSnapshot): string {
  const reference = snapshot.reference ?? "";
  if (snapshot.reference_type === "QRR") return formatQRReference(reference);
  if (snapshot.reference_type === "SCOR") return formatSCORReference(reference);
  if (snapshot.reference_type === "INVOICE_NUMBER") return reference;
  return "";
}

function addressLines(a: QrPaymentPartDebtor | null | undefined): string[] {
  if (!a) return [];
  const line1 = [a.street, a.houseNumber].filter(Boolean).join(" ");
  const line2 = [a.zip, a.city].filter(Boolean).join(" ");
  return [line1, line2].filter((l) => l.trim().length > 0);
}

function creditorLines(snapshot: PaymentSnapshot): string[] {
  const a = snapshot.account_holder_address;
  return [snapshot.account_holder, ...addressLines(a)];
}

/**
 * Complete "Zahlteil" as an e-mail-safe HTML block.
 * Structure mirrors the printed Swiss QR-bill payment part: QR code, amount,
 * account/payable to, reference, additional information, payable by.
 */
export function buildQrPaymentPartHtml(input: QrPaymentPartInput): string {
  const { snapshot, amount, debtor, invoiceNumber, dueDate, qrDataUrl } = input;
  if (!snapshot) return "";

  const reference = paymentPartReference(snapshot);
  const label = 'style="font-size:8px;font-weight:bold;color:#000;margin:0"';
  const value = 'style="font-size:10px;color:#000;margin:0 0 2px 0"';
  const row = (l: string, v: string) =>
    v
      ? `<p ${label}>${esc(l)}</p><p ${value}>${esc(v)}</p>`
      : "";

  const qrBlock = qrDataUrl
    ? `<img src="${esc(qrDataUrl)}" alt="Swiss QR-Code" width="150" height="150" style="display:block;width:150px;height:150px" />`
    : `<div style="width:150px;height:150px;border:1px solid #000"></div>`;

  const additional = [
    snapshot.payment_message,
    invoiceNumber ? `Rechnung ${invoiceNumber}` : "",
    dueDate ? `Zahlbar bis ${dueDate}` : "",
  ].filter((l) => l && l.trim().length > 0) as string[];

  const creditorBlock = [
    `<p ${label}>Konto / Zahlbar an</p>`,
    `<p ${value}>${esc(formatIBAN(snapshot.iban))}</p>`,
    ...creditorLines(snapshot).map((line) => `<p ${value}>${esc(line)}</p>`),
  ].join("");

  const debtorBlock = debtor?.name
    ? [
        `<p ${label}>Zahlbar durch</p>`,
        `<p ${value}>${esc(debtor.name)}</p>`,
        ...addressLines(debtor).map((line) => `<p ${value}>${esc(line)}</p>`),
      ].join("")
    : "";

  return [
    '<div style="border:1px solid #000;padding:12px;font-family:Helvetica,Arial,sans-serif;max-width:560px">',
    '<p style="font-size:12px;font-weight:bold;color:#000;margin:0 0 8px 0">Zahlteil</p>',
    qrBlock,
    '<div style="margin-top:8px">',
    `<p ${label}>Währung</p><p ${value}>${esc(snapshot.currency)}</p>`,
    `<p ${label}>Betrag</p><p ${value}>${esc(formatPaymentAmount(amount))}</p>`,
    "</div>",
    `<div style="margin-top:8px">${creditorBlock}</div>`,
    '<div style="margin-top:8px">',
    row("Referenz", reference),
    row("Zusätzliche Informationen", additional.join(" · ")),
    debtorBlock,
    "</div>",
    "</div>",
  ].join("");
}

/** Plain text alternative of the payment part (mail clients without HTML). */
export function buildQrPaymentPartText(input: QrPaymentPartInput): string {
  const { snapshot, amount, debtor, invoiceNumber, dueDate } = input;
  if (!snapshot) return "";
  const reference = paymentPartReference(snapshot);
  const lines = [
    "Zahlteil",
    `Betrag: ${snapshot.currency} ${formatPaymentAmount(amount)}`,
    `Konto / Zahlbar an: ${formatIBAN(snapshot.iban)}`,
    ...creditorLines(snapshot),
  ];
  if (reference) lines.push(`Referenz: ${reference}`);
  const additional = [snapshot.payment_message, invoiceNumber ? `Rechnung ${invoiceNumber}` : "", dueDate ? `Zahlbar bis ${dueDate}` : ""]
    .filter((l) => !!l && l.trim().length > 0);
  if (additional.length) lines.push(`Zusätzliche Informationen: ${additional.join(" · ")}`);
  if (debtor?.name) lines.push(`Zahlbar durch: ${[debtor.name, ...addressLines(debtor)].join(", ")}`);
  return lines.join("\n");
}
