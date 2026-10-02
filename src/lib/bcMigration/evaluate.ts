/**
 * Pure, deterministic dry-run evaluator for the normalized Booking-Corner package.
 * Produces proposed actions only — it never mutates anything and has no I/O.
 * Unavailable checks are passed as `null` and become blockers (never a pass).
 */
import { SUPPORTED_CURRENCIES, type MigrationPackage, type Sale, type Session, type Item } from "./contract";

export type SaleStatus = "ready_for_review" | "blocked" | "duplicate_candidate" | "out_of_scope";
export interface Window { from: string; until: string }
export interface ExistingTargetItem {
  id: string; ticket_id: string; date: string; time_start: string | null; time_end: string | null;
  instructor_id: string | null; appointment_id: string | null;
}
export interface EvalContext {
  season: { start: string; end: string };
  /** source teacher id → target instructor UUIDs (exact booking_corner source-link match). null = not readable. */
  instructorLinks: Map<string, string[]> | null;
  /** instructor UUID → deployment windows. null = not readable. */
  deploymentWindows: Map<string, Window[]> | null;
  /** existing target items in the season range. null = not readable. */
  existingItems: ExistingTargetItem[] | null;
  /** Absence / collision-with-other-bookings / capability checks are not implemented server-side yet. */
  absenceCheckAvailable: false;
  capabilityCheckAvailable: false;
}

export interface ProjectedSession {
  source_session_id: string; source_item_id: string; kind: Item["kind"];
  date: string; start: string; end: string;
  instructor_id: string | null; // null = stays unassigned
  target: "private_appointments" | "group_course_instances";
  participant_ids: string[]; // target customer_participants UUIDs (empty for school slots)
  headcount: number | null;
  billing_ticket_items: 0 | 1; // exactly one mirrored line per private appointment
  price_minor: number | null;
}
export interface SaleResult {
  source_sale_id: string;
  status: SaleStatus;
  blockers: string[];
  warnings: string[];
  mappings: { source_teacher_id: string; instructor_id: string }[];
  sessions_in_scope: number;
  sessions_out_of_scope: number;
  projection: ProjectedSession[];
  collisions: { source_session_id: string; target_item_id: string; target_ticket_id: string }[];
  finance: {
    currency: string; items_total_minor: number | null; discount_minor: number;
    invoiced_minor: number | null; paid_minor: number; refunded_minor: number; credit_minor: number;
    original_invoices: { source_invoice_id: string; number: string; issue_date: string; due_date: string | null; currency: string; document_ref: string | null; payment_reference: string | null }[];
  };
  proposed_actions: string[];
}
export interface Report {
  snapshot_id: string;
  global_blockers: string[];
  totals: Record<SaleStatus, number> & { sales: number; sessions_in_scope: number; collisions: number };
  sales: SaleResult[];
  unmatched_existing_items: string[]; // existing target items not touched by any source session
}

const overlap = (a1: string, a2: string, b1: string, b2: string) => a1 < b2 && b1 < a2;
const hhmm = (t: string | null) => (t ?? "").slice(0, 5);

export function evaluatePackage(pkg: MigrationPackage, ctx: EvalContext): Report {
  const global: string[] = [];
  if (!pkg.manifest.adapter) global.push("source_adapter_missing:original_bc_export_not_mapped");
  if (ctx.instructorLinks === null) global.push("instructor_mapping_unverifiable:source_links_not_readable");
  if (ctx.deploymentWindows === null) global.push("deployment_window_check_unavailable");
  if (ctx.existingItems === null) global.push("target_collision_read_unavailable");
  if (!ctx.absenceCheckAvailable) global.push("absence_check_unavailable");
  if (!ctx.capabilityCheckAvailable) global.push("capability_check_unavailable");
  global.push("schema_gap:no_invoice_level_payment_allocation");

  const participants = new Map(pkg.participants.map((p) => [p.source_participant_id, p.target_participant_id]));
  const touched = new Set<string>();
  const sales = pkg.sales.map((s) => evaluateSale(s, ctx, participants, touched));
  const totals = { ready_for_review: 0, blocked: 0, duplicate_candidate: 0, out_of_scope: 0, sales: sales.length, sessions_in_scope: 0, collisions: 0 };
  for (const r of sales) { totals[r.status]++; totals.sessions_in_scope += r.sessions_in_scope; totals.collisions += r.collisions.length; }
  const unmatched = (ctx.existingItems ?? []).filter((i) => !touched.has(i.id)).map((i) => i.id).sort();
  return { snapshot_id: pkg.manifest.snapshot_id, global_blockers: global, totals, sales, unmatched_existing_items: unmatched };
}

function evaluateSale(s: Sale, ctx: EvalContext, participants: Map<string, string | null>, touched: Set<string>): SaleResult {
  const b: string[] = [];
  const w: string[] = [];
  const mappings = new Map<string, string>();
  const projection: ProjectedSession[] = [];
  const collisions: SaleResult["collisions"] = [];
  let inScope = 0, outScope = 0;

  if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(s.currency)) b.push("currency_unsupported");
  if (!s.target_customer_id) b.push("customer_unresolved");

  for (const it of s.items) {
    if (it.amount_minor === null) b.push(`amount_missing:${it.source_item_id}`);
    const inSeason = it.sessions.filter((x) => x.date >= ctx.season.start && x.date <= ctx.season.end);
    outScope += it.sessions.length - inSeason.length;
    inScope += inSeason.length;
    // Cross-period: only in-season sessions are projected; the sale is never duplicated.
    if (inSeason.length && inSeason.length < it.sessions.length) w.push(`cross_period_partial:${it.source_item_id}`);
    const needsAllocation = inSeason.length > 0 && inSeason.length < it.sessions.length;
    if (!it.roster_resolved && it.kind !== "school_camp" && it.kind !== "school_group") b.push(`roster_unresolved:${it.source_item_id}`);
    const allPriced = it.sessions.every((x) => x.price_minor != null);
    if ((needsAllocation || it.kind === "private") && it.sessions.length > 1 && !allPriced) b.push(`price_allocation_missing:${it.source_item_id}`);
    if (allPriced && it.amount_minor !== null && it.sessions.reduce((a, x) => a + (x.price_minor as number), 0) !== it.amount_minor)
      b.push(`price_allocation_mismatch:${it.source_item_id}`);

    for (const se of inSeason) projection.push(projectSession(it, se, ctx, participants, mappings, b));
  }

  // Collisions with existing target rows (same instructor, date, overlapping time).
  if (ctx.existingItems) {
    for (const p of projection) {
      if (!p.instructor_id) continue;
      for (const ex of ctx.existingItems) {
        if (ex.instructor_id === p.instructor_id && ex.date === p.date && ex.time_start && ex.time_end && overlap(p.start, p.end, hhmm(ex.time_start), hhmm(ex.time_end))) {
          collisions.push({ source_session_id: p.source_session_id, target_item_id: ex.id, target_ticket_id: ex.ticket_id });
          touched.add(ex.id);
        }
      }
    }
  }

  const finance = evaluateFinance(s, b, w);
  const status: SaleStatus = inScope === 0 ? "out_of_scope" : b.length ? "blocked" : collisions.length ? "duplicate_candidate" : "ready_for_review";
  const actions: string[] = status === "out_of_scope" ? ["skip:no_session_in_season"] : [
    ...projection.map((p) => p.target === "private_appointments"
      ? `propose:private_appointment+${p.participant_ids.length}_participants+1_ticket_item:${p.source_session_id}`
      : `propose:group_slot:${p.source_session_id}`),
    ...finance.original_invoices.map((i) => `propose:retain_original_invoice:${i.source_invoice_id}`),
  ];
  return {
    source_sale_id: s.source_sale_id, status, blockers: [...new Set(b)], warnings: [...new Set(w)],
    mappings: [...mappings].map(([source_teacher_id, instructor_id]) => ({ source_teacher_id, instructor_id })),
    sessions_in_scope: inScope, sessions_out_of_scope: outScope, projection, collisions, finance, proposed_actions: actions,
  };
}

function projectSession(it: Item, se: Session, ctx: EvalContext, participants: Map<string, string | null>, mappings: Map<string, string>, b: string[]): ProjectedSession {
  let instructor: string | null = null;
  if (se.teacher_source_id !== null) {
    const ids = ctx.instructorLinks?.get(se.teacher_source_id);
    if (!ctx.instructorLinks) b.push(`teacher_unverifiable:${se.source_session_id}`);
    else if (!ids || ids.length === 0) b.push(`teacher_link_missing:${se.source_session_id}`);
    else if (ids.length > 1) b.push(`teacher_link_ambiguous:${se.source_session_id}`);
    else {
      instructor = ids[0];
      mappings.set(se.teacher_source_id, instructor);
      const wins = ctx.deploymentWindows?.get(instructor);
      if (ctx.deploymentWindows && wins && wins.length && !wins.some((x) => se.date >= x.from && se.date <= x.until))
        b.push(`outside_deployment_window:${se.source_session_id}`);
    }
  }
  const isSchool = it.kind === "school_camp" || it.kind === "school_group";
  const isGroup = it.kind === "group" || it.kind === "saturday" || isSchool;
  if (isGroup) {
    if (!se.group?.source_group_id) b.push(`group_identity_missing:${se.source_session_id}`);
    if (se.teacher_source_id !== null && !se.group?.teacher_verified) b.push(`group_teacher_unverified:${se.source_session_id}`);
  }
  const pids: string[] = [];
  if (!isSchool) {
    if (it.kind === "private" && se.participant_source_ids.length === 0) b.push(`participants_missing:${se.source_session_id}`);
    for (const sp of se.participant_source_ids) {
      if (!participants.has(sp)) b.push(`participant_ref_invalid:${se.source_session_id}`);
      else { const t = participants.get(sp); if (!t) b.push(`participant_unresolved:${se.source_session_id}`); else pids.push(t); }
    }
  } else if (se.headcount == null) b.push(`school_headcount_missing:${se.source_session_id}`);
  return {
    source_session_id: se.source_session_id, source_item_id: it.source_item_id, kind: it.kind,
    date: se.date, start: se.start, end: se.end, instructor_id: instructor,
    target: it.kind === "private" ? "private_appointments" : "group_course_instances",
    participant_ids: pids, headcount: isSchool ? se.headcount ?? null : null,
    billing_ticket_items: it.kind === "private" ? 1 : 0,
    price_minor: se.price_minor ?? (it.sessions.length === 1 ? it.amount_minor : null),
  };
}

function evaluateFinance(s: Sale, b: string[], w: string[]): SaleResult["finance"] {
  const items = s.items.some((i) => i.amount_minor === null) ? null : s.items.reduce((a, i) => a + (i.amount_minor as number), 0);
  let discount = 0, paid = 0, refunded = 0, credit = 0;
  const invoiceIds = new Set(s.invoices.map((i) => i.source_invoice_id));
  for (const p of s.payments) {
    if (p.currency !== s.currency) b.push(`payment_currency_mismatch:${p.source_payment_id}`);
    if (p.amount_minor === null) { b.push(`payment_amount_missing:${p.source_payment_id}`); continue; }
    if (p.invoice_source_id && !invoiceIds.has(p.invoice_source_id)) b.push(`payment_invoice_ref_invalid:${p.source_payment_id}`);
    if (!p.semantics_confirmed) b.push(`payment_semantics_unresolved:${p.kind}:${p.source_payment_id}`);
    if (p.kind === "discount") discount += p.amount_minor;
    else if (p.kind === "refund") refunded += p.amount_minor;
    else if (p.kind === "credit") credit += p.amount_minor;
    else paid += p.amount_minor;
  }
  let invoiced: number | null = 0;
  for (const inv of s.invoices) {
    if (inv.currency !== s.currency) b.push(`invoice_currency_mismatch:${inv.source_invoice_id}`);
    if (!inv.semantics_confirmed) b.push(`invoice_semantics_unresolved:${inv.source_invoice_id}`);
    if (inv.total_minor === null) { b.push(`invoice_amount_missing:${inv.source_invoice_id}`); invoiced = null; }
    else if (invoiced !== null) invoiced += inv.total_minor;
    if (!inv.due_date) w.push(`invoice_due_date_missing:${inv.source_invoice_id}`);
  }
  if (items !== null && invoiced !== null && s.invoices.length && invoiced !== items - discount) b.push("money_inconsistent:invoice_vs_items_minus_discount");
  if (items !== null && paid + credit - refunded > items - discount) b.push("money_inconsistent:overpaid");
  if (s.payments.some((p) => p.invoice_source_id)) w.push("payment_allocation_not_representable_in_target_schema");
  return {
    currency: s.currency, items_total_minor: items, discount_minor: discount, invoiced_minor: s.invoices.length ? invoiced : null,
    paid_minor: paid, refunded_minor: refunded, credit_minor: credit,
    original_invoices: s.invoices.map((i) => ({ source_invoice_id: i.source_invoice_id, number: i.number, issue_date: i.issue_date, due_date: i.due_date, currency: i.currency, document_ref: i.document_ref, payment_reference: i.payment_reference })),
  };
}
