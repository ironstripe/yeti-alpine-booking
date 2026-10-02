/**
 * Pure, deterministic dry-run evaluator for the normalized Booking-Corner package.
 * Produces proposed actions only — it never mutates anything and has no I/O.
 * Unavailable checks become blockers (never a pass). No sale is ever import-ready in this
 * preparation milestone: `import_ready` is the literal `false` on every result.
 */
import { SUPPORTED_CURRENCIES, type MigrationPackage, type Sale, type Session, type Item, type Invoice } from "./contract";

/** Data-review outcome only. NOT an import decision (see `import_ready`). */
export type SaleStatus = "data_review_ok" | "blocked" | "collision_candidate" | "out_of_scope";
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
  /** existing target ticket_items in the season range. null = not readable. */
  existingItems: ExistingTargetItem[] | null;
  /** Checks with no implementation in this milestone. Typed `false` so nobody can pass them by flag. */
  absenceCheckAvailable: false;
  capabilityCheckAvailable: false;
  /** target_customer_id / target_participant_id existence is not verified against the target. */
  targetReferencesVerified: false;
  /** Mapping source group → real target group_course_instance + enrollment is not implemented. */
  groupTargetMappingAvailable: false;
}

export type ProjectionTarget =
  | "private_appointments"          // native: 1 private_appointments + participant joins + 1 mirrored ticket_items line
  | "group_target_unmapped"          // group/saturday: needs mapping to an existing target group instance → blocked
  | "school_unsupported";            // school_camp/school_group: native projection not supported here → blocked

export interface ProjectedSession {
  source_session_id: string; source_item_id: string; kind: Item["kind"];
  date: string; start: string; end: string;
  instructor_id: string | null; // null = stays unassigned
  target: ProjectionTarget;
  source_group_id: string | null; // preserved for group/school; shared across sales
  participant_ids: string[]; // target participant UUIDs (unverified existence; empty for school)
  headcount: number | null; // school slots only
  billing_ticket_items: 0 | 1; // exactly one mirrored line per private appointment; 0 = not projected
  price_minor: number | null; // per-sale price retained, never merged across sales
}
export interface Collision {
  source_session_id: string; target_item_id: string; target_ticket_id: string;
  /** Exact teacher/date/time overlap only. A candidate, NOT proven duplicate identity. */
  kind: "teacher_time_overlap_candidate";
}
export interface FinanceResult {
  currency: string;
  booking_status: string | null;
  source_balance_minor: number | null;
  items_total_minor: number | null;
  /** Only semantics_confirmed movements are counted here. */
  confirmed: { discount_minor: number; paid_minor: number; refunded_minor: number; credit_minor: number };
  /** Unconfirmed movements by kind — never counted as settled. */
  unconfirmed_minor: Record<string, number>;
  /** Signed: items − confirmed discount − (paid + credit − refunded). Negative = possible credit/overpayment. null = unknown. */
  computed_rest_minor: number | null;
  reconciliation: "allocated" | "unavailable" | "no_invoices";
  original_invoices: {
    source_invoice_id: string; kind: Invoice["kind"]; number: string | null; issue_date: string; due_date: string | null;
    currency: string; total_minor: number | null; document_ref: string | null; payment_reference: string | null;
    source_status: string | null; sent_at: string | null; paid_at: string | null;
    allocations: { source_item_id: string; amount_minor: number }[] | null;
  }[];
}
export interface SaleResult {
  source_sale_id: string;
  status: SaleStatus;
  import_ready: false;
  scheduler_state: "unverified" | "blocked" | "not_applicable";
  blockers: string[];
  warnings: string[];
  mappings: { source_teacher_id: string; instructor_id: string }[];
  item_status: { source_item_id: string; kind: Item["kind"]; source_status: string | null }[];
  sessions_in_scope: number;
  sessions_out_of_scope: number;
  projection: ProjectedSession[];
  collisions: Collision[];
  finance: FinanceResult;
  proposed_actions: string[];
}
export interface SharedGroup { source_group_id: string; sale_ids: string[]; session_ids: string[] }
export interface Report {
  snapshot_id: string;
  global_blockers: string[];
  totals: Record<SaleStatus, number> & { sales: number; import_ready: 0; sessions_in_scope: number; collision_candidates: number };
  sales: SaleResult[];
  /** Source groups referenced by sessions; one entry per group even when shared by many sales. */
  shared_groups: SharedGroup[];
  unmatched_existing_items: string[]; // existing target items not overlapped by any source session
}

const overlap = (a1: string, a2: string, b1: string, b2: string) => a1 < b2 && b1 < a2;
const hhmm = (t: string | null) => (t ?? "").slice(0, 5);
const isSchool = (k: Item["kind"]) => k === "school_camp" || k === "school_group";
const isGroup = (k: Item["kind"]) => k === "group" || k === "saturday";

export function evaluatePackage(pkg: MigrationPackage, ctx: EvalContext): Report {
  const global: string[] = [];
  if (!pkg.manifest.adapter) global.push("source_adapter_missing:original_bc_export_not_mapped");
  if (ctx.instructorLinks === null) global.push("instructor_mapping_unverifiable:source_links_not_readable");
  if (ctx.deploymentWindows === null) global.push("deployment_window_check_unavailable");
  if (ctx.existingItems === null) global.push("target_collision_read_unavailable");
  if (!ctx.absenceCheckAvailable) global.push("absence_check_unavailable");
  if (!ctx.capabilityCheckAvailable) global.push("capability_check_unavailable");
  if (!ctx.targetReferencesVerified) global.push("target_reference_verification_unavailable:customers_participants");
  global.push("collision_check_unavailable:group_course_instances");
  global.push("collision_check_unavailable:instructor_absences");
  global.push("collision_check_unavailable:source_source_overlaps");
  global.push("lifecycle_status_mapping_undefined");
  global.push("schema_gap:no_invoice_level_payment_allocation");
  global.push("import_apply_not_implemented");

  const participants = new Map(pkg.participants.map((p) => [p.source_participant_id, p.target_participant_id]));
  const touched = new Set<string>();
  const sales = pkg.sales.map((s) => evaluateSale(s, ctx, participants, touched));

  const groups = new Map<string, SharedGroup>();
  for (const r of sales) for (const p of r.projection) {
    if (!p.source_group_id) continue;
    const g = groups.get(p.source_group_id) ?? { source_group_id: p.source_group_id, sale_ids: [], session_ids: [] };
    if (!g.sale_ids.includes(r.source_sale_id)) g.sale_ids.push(r.source_sale_id);
    if (!g.session_ids.includes(p.source_session_id)) g.session_ids.push(p.source_session_id);
    groups.set(p.source_group_id, g);
  }

  const totals = { data_review_ok: 0, blocked: 0, collision_candidate: 0, out_of_scope: 0, sales: sales.length, import_ready: 0 as const, sessions_in_scope: 0, collision_candidates: 0 };
  for (const r of sales) { totals[r.status]++; totals.sessions_in_scope += r.sessions_in_scope; totals.collision_candidates += r.collisions.length; }
  const unmatched = (ctx.existingItems ?? []).filter((i) => !touched.has(i.id)).map((i) => i.id).sort();
  return {
    snapshot_id: pkg.manifest.snapshot_id, global_blockers: global, totals, sales,
    shared_groups: [...groups.values()].sort((a, b) => a.source_group_id.localeCompare(b.source_group_id)),
    unmatched_existing_items: unmatched,
  };
}

function evaluateSale(s: Sale, ctx: EvalContext, participants: Map<string, string | null>, touched: Set<string>): SaleResult {
  const b: string[] = [];
  const w: string[] = [];
  const mappings = new Map<string, string>();
  const projection: ProjectedSession[] = [];
  const collisions: Collision[] = [];
  let inScope = 0, outScope = 0;

  if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(s.currency)) b.push("currency_unsupported");
  if (!s.target_customer_id) b.push("customer_unresolved");
  else if (!ctx.targetReferencesVerified) b.push("target_customer_unverified");
  if (s.booking_status === null) b.push("booking_status_missing:preservation_unsupported");

  for (const it of s.items) {
    if (it.amount_minor === null) b.push(`amount_missing:${it.source_item_id}`);
    if (it.source_status === null) b.push(`item_status_missing:${it.source_item_id}`);
    const inSeason = it.sessions.filter((x) => x.date >= ctx.season.start && x.date <= ctx.season.end);
    outScope += it.sessions.length - inSeason.length;
    inScope += inSeason.length;
    // Cross-period: only in-season sessions are projected; the sale is never duplicated.
    if (inSeason.length && inSeason.length < it.sessions.length) w.push(`cross_period_partial:${it.source_item_id}`);
    const needsAllocation = inSeason.length > 0 && inSeason.length < it.sessions.length;
    if (!it.roster_resolved && !isSchool(it.kind)) b.push(`roster_unresolved:${it.source_item_id}`);
    const allPriced = it.sessions.every((x) => x.price_minor != null);
    if ((needsAllocation || it.kind === "private") && it.sessions.length > 1 && !allPriced) b.push(`price_allocation_missing:${it.source_item_id}`);
    if (allPriced && it.amount_minor !== null && it.sessions.reduce((a, x) => a + (x.price_minor as number), 0) !== it.amount_minor)
      b.push(`price_allocation_mismatch:${it.source_item_id}`);
    if (isSchool(it.kind)) b.push(`school_native_projection_unsupported:${it.source_item_id}`);

    for (const se of inSeason) projection.push(projectSession(it, se, ctx, participants, mappings, b));
  }

  // Collision CANDIDATES with existing target rows (same instructor, date, overlapping time).
  if (ctx.existingItems) {
    for (const p of projection) {
      if (!p.instructor_id) continue;
      for (const ex of ctx.existingItems) {
        if (ex.instructor_id === p.instructor_id && ex.date === p.date && ex.time_start && ex.time_end && overlap(p.start, p.end, hhmm(ex.time_start), hhmm(ex.time_end))) {
          collisions.push({ source_session_id: p.source_session_id, target_item_id: ex.id, target_ticket_id: ex.ticket_id, kind: "teacher_time_overlap_candidate" });
          touched.add(ex.id);
        }
      }
    }
  }

  const finance = evaluateFinance(s, b, w);
  const blockers = [...new Set(b)];
  const status: SaleStatus = inScope === 0 ? "out_of_scope" : blockers.length ? "blocked" : collisions.length ? "collision_candidate" : "data_review_ok";
  const schedulerBlocked = projection.some((p) => p.target !== "private_appointments") || blockers.length > 0;
  const actions: string[] = status === "out_of_scope" ? ["skip:no_session_in_season"] : [
    ...projection.map((p) => p.target === "private_appointments"
      ? `propose:private_appointment+${p.participant_ids.length}_participant_joins+1_ticket_item:${p.source_session_id}`
      : p.target === "group_target_unmapped"
        ? `blocked:group_enrollment_requires_target_instance_mapping:${p.source_group_id ?? "unknown"}:${p.source_session_id}`
        : `blocked:school_projection_unsupported:${p.kind}:${p.source_session_id}`),
    ...finance.original_invoices.map((i) => `propose:retain_original_invoice:${i.source_invoice_id}`),
    ...collisions.map((c) => `review:collision_candidate:${c.source_session_id}->${c.target_item_id}`),
  ];
  return {
    source_sale_id: s.source_sale_id, status, import_ready: false,
    scheduler_state: inScope === 0 ? "not_applicable" : schedulerBlocked ? "blocked" : "unverified",
    blockers, warnings: [...new Set(w)],
    mappings: [...mappings].map(([source_teacher_id, instructor_id]) => ({ source_teacher_id, instructor_id })),
    item_status: s.items.map((i) => ({ source_item_id: i.source_item_id, kind: i.kind, source_status: i.source_status })),
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
  const school = isSchool(it.kind);
  const group = isGroup(it.kind);
  const groupId = se.group?.source_group_id ?? null;
  if (group || school) {
    if (!groupId) b.push(`group_identity_missing:${se.source_session_id}`);
    if (se.teacher_source_id !== null && !se.group?.teacher_verified) b.push(`group_teacher_unverified:${se.source_session_id}`);
  }
  if (group && !ctx.groupTargetMappingAvailable) b.push(`group_target_mapping_unavailable:${groupId ?? "unknown"}`);
  const pids: string[] = [];
  if (!school) {
    if (it.kind === "private" && se.participant_source_ids.length === 0) b.push(`participants_missing:${se.source_session_id}`);
    for (const sp of se.participant_source_ids) {
      if (!participants.has(sp)) b.push(`participant_ref_invalid:${se.source_session_id}`);
      else {
        const t = participants.get(sp);
        if (!t) b.push(`participant_unresolved:${se.source_session_id}`);
        else { pids.push(t); if (!ctx.targetReferencesVerified) b.push(`participant_target_unverified:${se.source_session_id}`); }
      }
    }
  } else if (se.headcount == null) b.push(`school_headcount_missing:${se.source_session_id}`);
  return {
    source_session_id: se.source_session_id, source_item_id: it.source_item_id, kind: it.kind,
    date: se.date, start: se.start, end: se.end, instructor_id: instructor,
    target: it.kind === "private" ? "private_appointments" : group ? "group_target_unmapped" : "school_unsupported",
    source_group_id: group || school ? groupId : null,
    participant_ids: pids, headcount: school ? se.headcount : null,
    billing_ticket_items: it.kind === "private" ? 1 : 0,
    price_minor: se.price_minor ?? (it.sessions.length === 1 ? it.amount_minor : null),
  };
}

const sign = (inv: Invoice) => (inv.kind === "invoice" ? 1 : -1);

function evaluateFinance(s: Sale, b: string[], w: string[]): FinanceResult {
  const items = s.items.some((i) => i.amount_minor === null) ? null : s.items.reduce((a, i) => a + (i.amount_minor as number), 0);
  const conf = { discount_minor: 0, paid_minor: 0, refunded_minor: 0, credit_minor: 0 };
  const unconf: Record<string, number> = {};
  let paymentAmountMissing = false;
  const invoiceIds = new Set(s.invoices.map((i) => i.source_invoice_id));
  for (const p of s.payments) {
    if (p.currency !== s.currency) b.push(`payment_currency_mismatch:${p.source_payment_id}`);
    if (p.invoice_source_id && !invoiceIds.has(p.invoice_source_id)) b.push(`payment_invoice_ref_invalid:${p.source_payment_id}`);
    if (p.amount_minor === null) { b.push(`payment_amount_missing:${p.source_payment_id}`); paymentAmountMissing = true; continue; }
    if (!p.semantics_confirmed) {
      b.push(`payment_semantics_unresolved:${p.kind}:${p.source_payment_id}`);
      unconf[p.kind] = (unconf[p.kind] ?? 0) + p.amount_minor;
      continue;
    }
    if (p.kind === "discount") conf.discount_minor += p.amount_minor;
    else if (p.kind === "refund") conf.refunded_minor += p.amount_minor;
    else if (p.kind === "credit") conf.credit_minor += p.amount_minor;
    else conf.paid_minor += p.amount_minor;
  }

  // Original invoice identity/lifecycle must exist in the source; nothing is defaulted or invented.
  let allAllocated = s.invoices.length > 0;
  for (const inv of s.invoices) {
    const id = inv.source_invoice_id;
    if (inv.currency !== s.currency) b.push(`invoice_currency_mismatch:${id}`);
    if (!inv.semantics_confirmed) b.push(`invoice_semantics_unresolved:${id}`);
    if (inv.total_minor === null) b.push(`invoice_amount_missing:${id}`);
    if (!inv.number) b.push(`invoice_number_missing:${id}`);
    if (!inv.document_ref) b.push(`invoice_document_missing:${id}`);
    if (inv.kind === "invoice" && !inv.due_date) b.push(`invoice_due_date_missing:${id}`);
    if (inv.kind === "invoice" && !inv.payment_reference) b.push(`invoice_payment_reference_missing:${id}`);
    if (inv.source_status === null) b.push(`invoice_status_missing:preservation_unsupported:${id}`);
    if (inv.allocations === null) allAllocated = false;
    else if (inv.total_minor !== null && inv.allocations.reduce((a, x) => a + x.amount_minor, 0) !== inv.total_minor)
      b.push(`invoice_allocation_sum_mismatch:${id}`);
  }

  // Reconciliation only with explicit per-item allocation. Partial invoicing / credit notes are valid scopes.
  let reconciliation: FinanceResult["reconciliation"] = s.invoices.length ? "unavailable" : "no_invoices";
  if (s.invoices.length && !allAllocated) b.push("reconciliation_unavailable:invoice_allocation_missing");
  if (allAllocated) {
    reconciliation = "allocated";
    const perItem = new Map<string, number>();
    for (const inv of s.invoices) for (const a of inv.allocations ?? []) perItem.set(a.source_item_id, (perItem.get(a.source_item_id) ?? 0) + sign(inv) * a.amount_minor);
    for (const it of s.items) {
      const net = perItem.get(it.source_item_id) ?? 0;
      if (it.amount_minor !== null && net > it.amount_minor) b.push(`money_inconsistent:invoiced_exceeds_item:${it.source_item_id}`);
      if (net < 0) b.push(`money_inconsistent:negative_net_invoiced:${it.source_item_id}`);
    }
  }

  const rest = items === null || paymentAmountMissing ? null
    : items - conf.discount_minor - (conf.paid_minor + conf.credit_minor - conf.refunded_minor);
  if (rest !== null && rest < 0) b.push("overpayment_treatment_unresolved");
  if (Object.keys(unconf).length) w.push("unconfirmed_movements_not_counted_as_settled");
  if (rest !== null && s.source_balance_minor !== null && rest !== s.source_balance_minor) w.push("source_balance_differs_from_computed_rest");
  if (s.payments.some((p) => p.invoice_source_id)) w.push("payment_allocation_not_representable_in_target_schema");

  return {
    currency: s.currency, booking_status: s.booking_status, source_balance_minor: s.source_balance_minor,
    items_total_minor: items, confirmed: conf, unconfirmed_minor: unconf, computed_rest_minor: rest, reconciliation,
    original_invoices: s.invoices.map((i) => ({
      source_invoice_id: i.source_invoice_id, kind: i.kind, number: i.number, issue_date: i.issue_date, due_date: i.due_date,
      currency: i.currency, total_minor: i.total_minor, document_ref: i.document_ref, payment_reference: i.payment_reference,
      source_status: i.source_status, sent_at: i.sent_at, paid_at: i.paid_at,
      allocations: i.allocations ? i.allocations.map((a) => ({ ...a })) : null,
    })),
  };
}
