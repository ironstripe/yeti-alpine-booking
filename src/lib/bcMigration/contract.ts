/**
 * Booking-Corner → YETI normalized MIGRATION PREPARATION format, v1.
 * This is NOT the original Booking-Corner export (its CSV schema is unknown); a separate
 * source adapter producing this format is a named, still-missing prerequisite.
 * Pure module: no I/O, no persistence.
 */
export const BC_PACKAGE_FORMAT = "yeti.bc-migration.normalized";
export const BC_PACKAGE_VERSION = 1;
export const SUPPORTED_CURRENCIES = ["CHF", "EUR"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];
export type ItemKind = "private" | "group" | "saturday" | "school_camp" | "school_group";
export const ITEM_KINDS: ItemKind[] = ["private", "group", "saturday", "school_camp", "school_group"];
export type PaymentKind = "payment" | "online_payment" | "refund" | "discount" | "credit";
export const PAYMENT_KINDS: PaymentKind[] = ["payment", "online_payment", "refund", "discount", "credit"];

export interface Manifest {
  source_system: "booking_corner";
  rollout: string;
  snapshot_id: string;
  exported_at: string; // ISO timestamp of the source snapshot
  adapter: string | null; // null = no original BC adapter (blocker)
}
export interface Session {
  source_session_id: string;
  date: string; // YYYY-MM-DD (service date; scoping uses this, never created_at)
  start: string; // HH:MM
  end: string;
  teacher_source_id: string | null; // null = unassigned in source, stays unassigned
  participant_source_ids: string[];
  price_minor?: number | null; // explicit per-session price allocation
  group?: { source_group_id: string; teacher_verified: boolean } | null;
  headcount?: number | null; // school slots: count only, no invented participants
}
export interface Item {
  source_item_id: string;
  kind: ItemKind;
  amount_minor: number | null;
  roster_resolved: boolean;
  sessions: Session[];
}
export interface Invoice {
  source_invoice_id: string;
  number: string;
  issue_date: string;
  due_date: string | null;
  currency: string;
  total_minor: number | null;
  document_ref: string | null;
  payment_reference: string | null;
  semantics_confirmed: boolean;
}
export interface Payment {
  source_payment_id: string;
  kind: PaymentKind;
  amount_minor: number | null; // always positive magnitude; kind gives direction
  date: string;
  currency: string;
  invoice_source_id: string | null;
  reference: string | null;
  semantics_confirmed: boolean;
}
export interface Sale {
  source_sale_id: string;
  currency: string;
  source_customer_id: string;
  target_customer_id: string | null;
  items: Item[];
  invoices: Invoice[];
  payments: Payment[];
}
export interface Participant { source_participant_id: string; target_participant_id: string | null }
export interface MigrationPackage {
  format: typeof BC_PACKAGE_FORMAT;
  version: typeof BC_PACKAGE_VERSION;
  manifest: Manifest;
  participants: Participant[];
  sales: Sale[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export function isValidDate(s: unknown): s is string {
  if (typeof s !== "string" || !DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export const isValidTime = (s: unknown): s is string => typeof s === "string" && TIME.test(s);
export const isMinor = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const str = (v: unknown) => typeof v === "string" && v.trim().length > 0;

/** Structural schema validation. Returns stable error codes with paths (no values, no PII). */
export function validatePackage(raw: unknown): { ok: true; pkg: MigrationPackage } | { ok: false; errors: string[] } {
  const e: string[] = [];
  const o = raw as Record<string, unknown>;
  if (!o || typeof o !== "object") return { ok: false, errors: ["not_an_object"] };
  if (o.format !== BC_PACKAGE_FORMAT) e.push("format_unknown");
  if (o.version !== BC_PACKAGE_VERSION) e.push("version_unsupported");
  const m = o.manifest as Record<string, unknown> | undefined;
  if (!m || m.source_system !== "booking_corner" || !str(m.snapshot_id) || !str(m.rollout) || typeof m.exported_at !== "string" || Number.isNaN(Date.parse(m.exported_at as string)))
    e.push("manifest_invalid");
  if (!Array.isArray(o.participants)) e.push("participants_missing");
  if (!Array.isArray(o.sales)) e.push("sales_missing");
  if (e.length) return { ok: false, errors: e };

  const ids = new Set<string>();
  const uniq = (kind: string, id: unknown, path: string) => {
    if (!str(id)) { e.push(`${path}:id_missing`); return; }
    const k = `${kind}:${id}`;
    if (ids.has(k)) e.push(`${path}:duplicate_id`);
    ids.add(k);
  };
  (o.participants as Participant[]).forEach((p, i) => uniq("participant", p?.source_participant_id, `participants[${i}]`));
  (o.sales as Sale[]).forEach((s, si) => {
    const sp = `sales[${si}]`;
    uniq("sale", s?.source_sale_id, sp);
    if (!str(s?.source_customer_id)) e.push(`${sp}:customer_missing`);
    if (!Array.isArray(s?.items) || !Array.isArray(s?.invoices) || !Array.isArray(s?.payments)) { e.push(`${sp}:shape_invalid`); return; }
    s.items.forEach((it, ii) => {
      const ip = `${sp}.items[${ii}]`;
      uniq("item", it?.source_item_id, ip);
      if (!ITEM_KINDS.includes(it?.kind)) e.push(`${ip}:kind_invalid`);
      if (it.amount_minor !== null && !isMinor(it.amount_minor)) e.push(`${ip}:amount_not_integer_minor`);
      if (!Array.isArray(it.sessions)) { e.push(`${ip}:sessions_missing`); return; }
      it.sessions.forEach((se, xi) => {
        const xp = `${ip}.sessions[${xi}]`;
        uniq("session", se?.source_session_id, xp);
        if (!isValidDate(se.date)) e.push(`${xp}:date_invalid`);
        if (!isValidTime(se.start) || !isValidTime(se.end) || se.end <= se.start) e.push(`${xp}:time_invalid`);
        if (!Array.isArray(se.participant_source_ids)) e.push(`${xp}:participants_invalid`);
        if (se.price_minor != null && !isMinor(se.price_minor)) e.push(`${xp}:price_not_integer_minor`);
      });
    });
    s.invoices.forEach((inv, ni) => {
      const np = `${sp}.invoices[${ni}]`;
      uniq("invoice", inv?.source_invoice_id, np);
      if (!isValidDate(inv.issue_date)) e.push(`${np}:issue_date_invalid`);
      if (inv.due_date !== null && !isValidDate(inv.due_date)) e.push(`${np}:due_date_invalid`);
      if (inv.total_minor !== null && !isMinor(inv.total_minor)) e.push(`${np}:amount_not_integer_minor`);
    });
    s.payments.forEach((p, pi) => {
      const pp = `${sp}.payments[${pi}]`;
      uniq("payment", p?.source_payment_id, pp);
      if (!PAYMENT_KINDS.includes(p.kind)) e.push(`${pp}:kind_invalid`);
      if (!isValidDate(p.date)) e.push(`${pp}:date_invalid`);
      if (p.amount_minor !== null && (!isMinor(p.amount_minor) || p.amount_minor < 0)) e.push(`${pp}:amount_invalid`);
    });
  });
  return e.length ? { ok: false, errors: e } : { ok: true, pkg: raw as MigrationPackage };
}
