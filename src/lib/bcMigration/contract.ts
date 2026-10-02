/**
 * Booking-Corner → YETI normalized MIGRATION PREPARATION format, v1.
 * This is NOT the original Booking-Corner export (its CSV schema is unknown); a separate
 * source adapter producing this format is a named, still-missing prerequisite.
 * Pure module: no I/O, no persistence. validatePackage is total: it never throws on any input.
 */
export const BC_PACKAGE_FORMAT = "yeti.bc-migration.normalized";
export const BC_PACKAGE_VERSION = 1;
export const SUPPORTED_CURRENCIES = ["CHF", "EUR"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];
export type ItemKind = "private" | "group" | "saturday" | "school_camp" | "school_group";
export const ITEM_KINDS: ItemKind[] = ["private", "group", "saturday", "school_camp", "school_group"];
export type PaymentKind = "payment" | "online_payment" | "refund" | "discount" | "credit";
export const PAYMENT_KINDS: PaymentKind[] = ["payment", "online_payment", "refund", "discount", "credit"];
export type InvoiceKind = "invoice" | "credit_note" | "cancellation";
export const INVOICE_KINDS: InvoiceKind[] = ["invoice", "credit_note", "cancellation"];

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
  price_minor: number | null; // explicit per-session price allocation (null = none)
  group: { source_group_id: string; teacher_verified: boolean } | null;
  headcount: number | null; // school slots: count only, no invented participants
}
export interface Item {
  source_item_id: string;
  kind: ItemKind;
  /** Raw source lifecycle status (e.g. "booked", "cancelled"); null = not supplied. Never discarded. */
  source_status: string | null;
  amount_minor: number | null;
  roster_resolved: boolean;
  sessions: Session[];
}
export interface InvoiceAllocation { source_item_id: string; amount_minor: number }
export interface Invoice {
  source_invoice_id: string;
  kind: InvoiceKind;
  number: string | null;
  issue_date: string;
  due_date: string | null;
  currency: string;
  total_minor: number | null; // magnitude; kind gives direction
  document_ref: string | null;
  payment_reference: string | null;
  /** Raw source lifecycle evidence; null = not supplied. */
  source_status: string | null;
  sent_at: string | null;
  paid_at: string | null;
  /** Which sale items this document covers. null = scope unknown → reconciliation unavailable. */
  allocations: InvoiceAllocation[] | null;
  semantics_confirmed: boolean;
}
export interface Payment {
  source_payment_id: string;
  kind: PaymentKind;
  amount_minor: number | null; // always nonnegative magnitude; kind gives direction
  date: string;
  currency: string;
  invoice_source_id: string | null;
  reference: string | null;
  semantics_confirmed: boolean;
}
export interface Sale {
  source_sale_id: string;
  currency: string;
  /** Raw source booking lifecycle status; null = not supplied. */
  booking_status: string | null;
  /** Signed source-displayed balance (positive = customer owes); null = not supplied. */
  source_balance_minor: number | null;
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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidDate(s: unknown): s is string {
  if (typeof s !== "string" || !DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export const isValidTime = (s: unknown): s is string => typeof s === "string" && TIME.test(s);
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s);
export const isMinor = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const has = (o: Obj, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;

/** Field checkers. Each pushes a stable `path.field:code` error (no values, no PII). */
function checker(e: string[]) {
  const miss = (o: Obj, k: string, p: string) => { if (!has(o, k)) { e.push(`${p}.${k}:missing`); return true; } return false; };
  return {
    str(o: Obj, k: string, p: string) { if (!miss(o, k, p) && !nonEmpty(o[k])) e.push(`${p}.${k}:not_string`); },
    strOrNull(o: Obj, k: string, p: string) { if (!miss(o, k, p) && o[k] !== null && !nonEmpty(o[k])) e.push(`${p}.${k}:not_string_or_null`); },
    bool(o: Obj, k: string, p: string) { if (!miss(o, k, p) && typeof o[k] !== "boolean") e.push(`${p}.${k}:not_boolean`); },
    date(o: Obj, k: string, p: string) { if (!miss(o, k, p) && !isValidDate(o[k])) e.push(`${p}.${k}:date_invalid`); },
    dateOrNull(o: Obj, k: string, p: string) { if (!miss(o, k, p) && o[k] !== null && !isValidDate(o[k])) e.push(`${p}.${k}:date_invalid`); },
    time(o: Obj, k: string, p: string) { if (!miss(o, k, p) && !isValidTime(o[k])) e.push(`${p}.${k}:time_invalid`); },
    uuidOrNull(o: Obj, k: string, p: string) { if (!miss(o, k, p) && o[k] !== null && !isUuid(o[k])) e.push(`${p}.${k}:uuid_invalid`); },
    /** nonneg=true: magnitude ≥ 0. */
    minorOrNull(o: Obj, k: string, p: string, nonneg: boolean) {
      if (miss(o, k, p) || o[k] === null) return;
      if (!isMinor(o[k])) e.push(`${p}.${k}:not_safe_integer_minor`);
      else if (nonneg && (o[k] as number) < 0) e.push(`${p}.${k}:negative`);
    },
    oneOf(o: Obj, k: string, p: string, allowed: readonly string[]) {
      if (!miss(o, k, p) && !(typeof o[k] === "string" && allowed.includes(o[k] as string))) e.push(`${p}.${k}:invalid`);
    },
    arr(o: Obj, k: string, p: string): unknown[] | null {
      if (miss(o, k, p)) return null;
      if (!Array.isArray(o[k])) { e.push(`${p}.${k}:not_array`); return null; }
      return o[k] as unknown[];
    },
  };
}

/** Structural schema validation. Total: never throws; returns stable path errors. */
export function validatePackage(raw: unknown): { ok: true; pkg: MigrationPackage } | { ok: false; errors: string[] } {
  const e: string[] = [];
  try {
    if (!isObj(raw)) return { ok: false, errors: ["not_an_object"] };
    const c = checker(e);
    if (raw.format !== BC_PACKAGE_FORMAT) e.push("format_unknown");
    if (raw.version !== BC_PACKAGE_VERSION) e.push("version_unsupported");
    const m = raw.manifest;
    if (!isObj(m)) e.push("manifest:not_object");
    else {
      if (m.source_system !== "booking_corner") e.push("manifest.source_system:invalid");
      c.str(m, "rollout", "manifest"); c.str(m, "snapshot_id", "manifest"); c.strOrNull(m, "adapter", "manifest");
      if (typeof m.exported_at !== "string" || Number.isNaN(Date.parse(m.exported_at))) e.push("manifest.exported_at:invalid");
    }
    const participants = c.arr(raw, "participants", "root");
    const sales = c.arr(raw, "sales", "root");
    if (e.length || !participants || !sales) return { ok: false, errors: e };

    const ids = new Set<string>();
    const uniq = (kind: string, o: Obj, key: string, p: string) => {
      if (!nonEmpty(o[key])) { e.push(`${p}.${key}:id_missing`); return; }
      const k = `${kind}:${o[key]}`;
      if (ids.has(k)) e.push(`${p}:duplicate_id`);
      ids.add(k);
    };
    participants.forEach((pt, i) => {
      const p = `participants[${i}]`;
      if (!isObj(pt)) { e.push(`${p}:not_object`); return; }
      uniq("participant", pt, "source_participant_id", p);
      c.uuidOrNull(pt, "target_participant_id", p);
    });
    sales.forEach((s, si) => {
      const sp = `sales[${si}]`;
      if (!isObj(s)) { e.push(`${sp}:not_object`); return; }
      uniq("sale", s, "source_sale_id", sp);
      c.str(s, "source_customer_id", sp); c.uuidOrNull(s, "target_customer_id", sp);
      c.str(s, "currency", sp); c.strOrNull(s, "booking_status", sp);
      c.minorOrNull(s, "source_balance_minor", sp, false);
      const items = c.arr(s, "items", sp), invoices = c.arr(s, "invoices", sp), payments = c.arr(s, "payments", sp);
      const itemIds = new Set<string>();
      items?.forEach((it, ii) => {
        const ip = `${sp}.items[${ii}]`;
        if (!isObj(it)) { e.push(`${ip}:not_object`); return; }
        uniq("item", it, "source_item_id", ip);
        if (nonEmpty(it.source_item_id)) itemIds.add(it.source_item_id);
        c.oneOf(it, "kind", ip, ITEM_KINDS); c.strOrNull(it, "source_status", ip);
        c.minorOrNull(it, "amount_minor", ip, true); c.bool(it, "roster_resolved", ip);
        const sessions = c.arr(it, "sessions", ip);
        sessions?.forEach((se, xi) => {
          const xp = `${ip}.sessions[${xi}]`;
          if (!isObj(se)) { e.push(`${xp}:not_object`); return; }
          uniq("session", se, "source_session_id", xp);
          c.date(se, "date", xp); c.time(se, "start", xp); c.time(se, "end", xp);
          if (isValidTime(se.start) && isValidTime(se.end) && se.end <= se.start) e.push(`${xp}:time_order_invalid`);
          c.strOrNull(se, "teacher_source_id", xp);
          const pids = c.arr(se, "participant_source_ids", xp);
          if (pids) {
            if (!pids.every(nonEmpty)) e.push(`${xp}.participant_source_ids:not_string`);
            else if (new Set(pids).size !== pids.length) e.push(`${xp}.participant_source_ids:duplicate_ref`);
          }
          c.minorOrNull(se, "price_minor", xp, true);
          if (!has(se, "headcount")) e.push(`${xp}.headcount:missing`);
          else if (se.headcount !== null && !(isMinor(se.headcount) && (se.headcount as number) > 0)) e.push(`${xp}.headcount:not_positive_integer`);
          if (!has(se, "group")) e.push(`${xp}.group:missing`);
          else if (se.group !== null) {
            if (!isObj(se.group)) e.push(`${xp}.group:not_object`);
            else { c.str(se.group, "source_group_id", `${xp}.group`); c.bool(se.group, "teacher_verified", `${xp}.group`); }
          }
        });
      });
      invoices?.forEach((inv, ni) => {
        const np = `${sp}.invoices[${ni}]`;
        if (!isObj(inv)) { e.push(`${np}:not_object`); return; }
        uniq("invoice", inv, "source_invoice_id", np);
        c.oneOf(inv, "kind", np, INVOICE_KINDS); c.strOrNull(inv, "number", np);
        c.date(inv, "issue_date", np); c.dateOrNull(inv, "due_date", np);
        c.str(inv, "currency", np); c.minorOrNull(inv, "total_minor", np, true);
        c.strOrNull(inv, "document_ref", np); c.strOrNull(inv, "payment_reference", np);
        c.strOrNull(inv, "source_status", np); c.dateOrNull(inv, "sent_at", np); c.dateOrNull(inv, "paid_at", np);
        c.bool(inv, "semantics_confirmed", np);
        if (!has(inv, "allocations")) e.push(`${np}.allocations:missing`);
        else if (inv.allocations !== null) {
          if (!Array.isArray(inv.allocations)) e.push(`${np}.allocations:not_array`);
          else inv.allocations.forEach((a, ai) => {
            const ap = `${np}.allocations[${ai}]`;
            if (!isObj(a)) { e.push(`${ap}:not_object`); return; }
            c.str(a, "source_item_id", ap); c.minorOrNull(a, "amount_minor", ap, true);
            if (a.amount_minor === null) e.push(`${ap}.amount_minor:missing`);
            if (nonEmpty(a.source_item_id) && !itemIds.has(a.source_item_id)) e.push(`${ap}.source_item_id:ref_invalid`);
          });
        }
      });
      payments?.forEach((pm, pi) => {
        const pp = `${sp}.payments[${pi}]`;
        if (!isObj(pm)) { e.push(`${pp}:not_object`); return; }
        uniq("payment", pm, "source_payment_id", pp);
        c.oneOf(pm, "kind", pp, PAYMENT_KINDS); c.date(pm, "date", pp); c.str(pm, "currency", pp);
        c.minorOrNull(pm, "amount_minor", pp, true);
        c.strOrNull(pm, "invoice_source_id", pp); c.strOrNull(pm, "reference", pp);
        c.bool(pm, "semantics_confirmed", pp);
      });
    });
  } catch {
    e.push("validator_internal_error");
  }
  return e.length ? { ok: false, errors: e } : { ok: true, pkg: raw as unknown as MigrationPackage };
}
