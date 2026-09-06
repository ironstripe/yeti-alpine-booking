/**
 * Shared finance helpers.
 *
 * Formulas used across the app (single source of truth):
 *   effective_paid      = tickets.paid_amount (kept in sync with completed payments + applied credits)
 *   outstanding_balance = max(0, total_amount - effective_paid)
 *   payment status      = derived from amounts + due date, never stored free-form
 */

export type PaymentMethod = "cash" | "card" | "twint" | "voucher" | "invoice" | "hotel";

export type SettlementChoice = "paid_now" | "pay_later";

/** Methods that represent an immediate settlement at booking time. */
export const IMMEDIATE_PAYMENT_METHODS: PaymentMethod[] = ["cash", "card", "twint", "voucher"];

/** Methods that always leave an open balance at booking time. */
export const DEFERRED_PAYMENT_METHODS: PaymentMethod[] = ["invoice", "hotel"];

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Bar",
  card: "Karte",
  twint: "TWINT",
  voucher: "Gutschein",
  invoice: "Rechnung",
  hotel: "Hotel",
  credit: "Guthaben",
  online: "Online",
};

export function getPaymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "–";
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

export function isImmediateMethod(method: string | null | undefined): boolean {
  return !!method && IMMEDIATE_PAYMENT_METHODS.includes(method as PaymentMethod);
}

/** Ticket statuses that must never contribute to outstanding balances or reporting. */
export const EXCLUDED_TICKET_STATUSES = ["cancelled", "storno", "storniert", "expired", "rejected"];

/** Ticket item statuses that must never contribute to reporting. */
export const EXCLUDED_ITEM_STATUSES = ["cancelled", "storno", "storniert", "expired", "rejected"];

export function isActiveTicketStatus(status: string | null | undefined): boolean {
  if (!status) return true;
  return !EXCLUDED_TICKET_STATUSES.includes(status.toLowerCase());
}

export function isActiveItemStatus(status: string | null | undefined): boolean {
  if (!status) return true;
  return !EXCLUDED_ITEM_STATUSES.includes(status.toLowerCase());
}

export function getOutstanding(
  totalAmount: number | null | undefined,
  paidAmount: number | null | undefined
): number {
  const outstanding = Number(totalAmount || 0) - Number(paidAmount || 0);
  return Math.round(Math.max(0, outstanding) * 100) / 100;
}

export type DerivedPaymentStatus = "unpaid" | "partial" | "paid" | "overdue";

export function derivePaymentStatus(params: {
  totalAmount: number | null | undefined;
  paidAmount: number | null | undefined;
  dueDate?: string | null;
  now?: Date;
}): DerivedPaymentStatus {
  const total = Number(params.totalAmount || 0);
  const paid = Number(params.paidAmount || 0);
  const outstanding = getOutstanding(total, paid);

  if (outstanding <= 0.009) return "paid";

  if (params.dueDate) {
    const due = new Date(`${params.dueDate}T23:59:59`);
    const now = params.now ?? new Date();
    if (!isNaN(due.getTime()) && due < now) return "overdue";
  }

  return paid > 0 ? "partial" : "unpaid";
}

export const PAYMENT_STATUS_LABELS: Record<DerivedPaymentStatus, string> = {
  unpaid: "Offen",
  partial: "Teilweise bezahlt",
  paid: "Bezahlt",
  overdue: "Überfällig",
};

export function formatCHF(amount: number | null | undefined): string {
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: 2,
  }).format(Number(amount || 0));
}

/** Build a CSV string (semicolon separated, Excel/CH friendly) with BOM. */
export function buildCsv(rows: (string | number | null | undefined)[][]): string {
  const escape = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return "\uFEFF" + rows.map((row) => row.map(escape).join(";")).join("\n");
}

export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const blob = new Blob([buildCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Deduplicate teaching sessions: the same instructor teaching the same slot for
 * several participants (or several customer tickets of a shared lesson) is ONE session.
 */
export function sessionKey(parts: {
  instructorId: string | null | undefined;
  date: string | null | undefined;
  timeStart: string | null | undefined;
  timeEnd: string | null | undefined;
}): string {
  return [parts.instructorId ?? "none", parts.date ?? "", parts.timeStart ?? "", parts.timeEnd ?? ""].join("|");
}

export function minutesBetween(timeStart?: string | null, timeEnd?: string | null): number {
  if (!timeStart || !timeEnd) return 0;
  const [sh, sm] = timeStart.split(":").map(Number);
  const [eh, em] = timeEnd.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => isNaN(n))) return 0;
  return Math.max(0, eh * 60 + em - (sh * 60 + sm));
}
