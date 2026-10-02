import { describe, test as it, expect } from "bun:test";
import { validatePackage, type MigrationPackage } from "../src/lib/bcMigration/contract";
import { evaluatePackage, type EvalContext } from "../src/lib/bcMigration/evaluate";
import { schedulerBlocks, toSchedulerRows } from "../src/lib/bcMigration/schedulerProjection";
import { collapseAppointmentRows } from "../src/lib/schedulerCollapse";

// Synthetic, non-personal fixture built in code (no real source data committed).
const T1 = "00000000-0000-4000-8000-000000000001";
function pkg(over: (p: MigrationPackage) => void = () => {}): MigrationPackage {
  const p: MigrationPackage = {
    format: "yeti.bc-migration.normalized", version: 1,
    manifest: { source_system: "booking_corner", rollout: "yeti_2026_27", snapshot_id: "snap-1", exported_at: "2026-10-02T10:00:00Z", adapter: "synthetic-test" },
    participants: [{ source_participant_id: "p1", target_participant_id: "tp1" }, { source_participant_id: "p2", target_participant_id: "tp2" }],
    sales: [{
      source_sale_id: "s1", currency: "CHF", source_customer_id: "c1", target_customer_id: "tc1",
      items: [{ source_item_id: "i1", kind: "private", amount_minor: 30000, roster_resolved: true, sessions: [
        { source_session_id: "x1", date: "2026-12-28", start: "10:00", end: "12:00", teacher_source_id: "t1", participant_source_ids: ["p1", "p2"], price_minor: 15000 },
        { source_session_id: "x2", date: "2026-12-29", start: "10:00", end: "12:00", teacher_source_id: "t1", participant_source_ids: ["p1", "p2"], price_minor: 15000 },
      ] }],
      invoices: [{ source_invoice_id: "inv1", number: "R-1", issue_date: "2026-11-01", due_date: "2026-11-30", currency: "CHF", total_minor: 30000, document_ref: "doc-1", payment_reference: "ref-1", semantics_confirmed: true }],
      payments: [{ source_payment_id: "pay1", kind: "payment", amount_minor: 10000, date: "2026-11-05", currency: "CHF", invoice_source_id: "inv1", reference: null, semantics_confirmed: true }],
    }],
  };
  over(p);
  return p;
}
const ctx = (o: Partial<EvalContext> = {}): EvalContext => ({
  season: { start: "2026-12-01", end: "2027-04-15" },
  instructorLinks: new Map([["t1", [T1]]]), deploymentWindows: new Map([[T1, [{ from: "2026-12-01", until: "2027-04-15" }]]]),
  existingItems: [], absenceCheckAvailable: false, capabilityCheckAvailable: false, ...o,
});
const sale = (p: MigrationPackage, c = ctx()) => evaluatePackage(p, c).sales[0];

describe("contract validation", () => {
  it("accepts a valid package", () => expect(validatePackage(pkg()).ok).toBe(true));
  it("rejects invalid dates, duplicate ids, non-integer money", () => {
    const r = validatePackage(pkg((p) => {
      p.sales[0].items[0].sessions[0].date = "2026-02-30";
      p.sales[0].items[0].sessions[1].source_session_id = "x1";
      p.sales[0].items[0].amount_minor = 12.5;
    }));
    expect(r.ok).toBe(false);
    const errs = (r as { errors: string[] }).errors.join(" ");
    expect(errs).toContain("date_invalid");
    expect(errs).toContain("duplicate_id");
    expect(errs).toContain("amount_not_integer_minor");
  });
  it("rejects unknown format/version", () => expect(validatePackage({ ...pkg(), version: 2 }).ok).toBe(false));
});

describe("evaluator", () => {
  it("ready_for_review with exact UUID reuse; global blockers still listed", () => {
    const rep = evaluatePackage(pkg(), ctx());
    expect(rep.sales[0].status).toBe("ready_for_review");
    expect(rep.sales[0].mappings).toEqual([{ source_teacher_id: "t1", instructor_id: T1 }]);
    expect(rep.global_blockers).toContain("absence_check_unavailable");
    expect(rep.global_blockers).toContain("schema_gap:no_invoice_level_payment_allocation");
  });
  it("missing amount is a blocker, never 0", () => {
    const r = sale(pkg((p) => { p.sales[0].items[0].amount_minor = null; }));
    expect(r.status).toBe("blocked");
    expect(r.blockers).toContain("amount_missing:i1");
    expect(r.finance.items_total_minor).toBeNull();
  });
  it("unknown/ambiguous teacher link blocks; no name fallback", () => {
    expect(sale(pkg(), ctx({ instructorLinks: new Map() })).blockers).toContain("teacher_link_missing:x1");
    expect(sale(pkg(), ctx({ instructorLinks: new Map([["t1", [T1, "other"]]]) })).blockers).toContain("teacher_link_ambiguous:x1");
    const r = evaluatePackage(pkg(), ctx({ instructorLinks: null }));
    expect(r.global_blockers).toContain("instructor_mapping_unverifiable:source_links_not_readable");
    expect(r.sales[0].status).toBe("blocked");
  });
  it("source-unassigned stays unassigned", () => {
    const r = sale(pkg((p) => p.sales[0].items[0].sessions.forEach((s) => (s.teacher_source_id = null))));
    expect(r.projection.every((s) => s.instructor_id === null)).toBe(true);
    expect(r.mappings).toEqual([]);
  });
  it("outside deployment window blocks", () => {
    expect(sale(pkg(), ctx({ deploymentWindows: new Map([[T1, [{ from: "2027-01-10", until: "2027-02-01" }]]]) })).blockers).toContain("outside_deployment_window:x1");
  });
  it("cross-period sale projects only in-season sessions, once", () => {
    const r = sale(pkg((p) => { p.sales[0].items[0].sessions[0].date = "2026-11-28"; }));
    expect(r.sessions_in_scope).toBe(1);
    expect(r.sessions_out_of_scope).toBe(1);
    expect(r.projection.map((s) => s.source_session_id)).toEqual(["x2"]);
    expect(r.warnings).toContain("cross_period_partial:i1");
  });
  it("multi-session private without explicit per-session price blocks", () => {
    const r = sale(pkg((p) => p.sales[0].items[0].sessions.forEach((s) => (s.price_minor = null))));
    expect(r.blockers).toContain("price_allocation_missing:i1");
  });
  it("money inconsistency and unresolved refund semantics block", () => {
    const r = sale(pkg((p) => {
      p.sales[0].invoices[0].total_minor = 29000;
      p.sales[0].payments.push({ source_payment_id: "r1", kind: "refund", amount_minor: 500, date: "2026-11-06", currency: "CHF", invoice_source_id: null, reference: null, semantics_confirmed: false });
    }));
    expect(r.blockers).toContain("money_inconsistent:invoice_vs_items_minus_discount");
    expect(r.blockers).toContain("payment_semantics_unresolved:refund:r1");
  });
  it("discount is not double counted", () => {
    const r = sale(pkg((p) => {
      p.sales[0].invoices[0].total_minor = 28000;
      p.sales[0].payments.push({ source_payment_id: "d1", kind: "discount", amount_minor: 2000, date: "2026-11-01", currency: "CHF", invoice_source_id: null, reference: null, semantics_confirmed: true });
    }));
    expect(r.blockers).toEqual([]);
    expect(r.finance.discount_minor).toBe(2000);
    expect(r.finance.paid_minor).toBe(10000);
  });
  it("original invoice identity preserved", () => {
    expect(sale(pkg()).finance.original_invoices[0]).toEqual({ source_invoice_id: "inv1", number: "R-1", issue_date: "2026-11-01", due_date: "2026-11-30", currency: "CHF", document_ref: "doc-1", payment_reference: "ref-1" });
  });
  it("existing target overlap → duplicate_candidate with exact ids", () => {
    const rep = evaluatePackage(pkg(), ctx({ existingItems: [
      { id: "ti-1", ticket_id: "tk-1", date: "2026-12-28", time_start: "11:00:00", time_end: "13:00:00", instructor_id: T1, appointment_id: null },
      { id: "ti-2", ticket_id: "tk-2", date: "2027-01-03", time_start: "09:00:00", time_end: "10:00:00", instructor_id: T1, appointment_id: null },
    ] }));
    expect(rep.sales[0].status).toBe("duplicate_candidate");
    expect(rep.sales[0].collisions).toEqual([{ source_session_id: "x1", target_item_id: "ti-1", target_ticket_id: "tk-1" }]);
    expect(rep.unmatched_existing_items).toEqual(["ti-2"]);
  });
  it("group needs verified group identity; school keeps headcount, no participants", () => {
    const g = sale(pkg((p) => { p.sales[0].items[0] = { source_item_id: "g1", kind: "group", amount_minor: 30000, roster_resolved: true, sessions: [{ source_session_id: "gx", date: "2027-01-04", start: "10:00", end: "12:00", teacher_source_id: "t1", participant_source_ids: ["p1"] }] }; }));
    expect(g.blockers).toContain("group_identity_missing:gx");
    expect(g.blockers).toContain("group_teacher_unverified:gx");
    const s = sale(pkg((p) => { p.sales[0].items[0] = { source_item_id: "sc", kind: "school_camp", amount_minor: 30000, roster_resolved: false, sessions: [{ source_session_id: "sx", date: "2027-01-05", start: "10:00", end: "12:00", teacher_source_id: "t1", participant_source_ids: [], headcount: 14, group: { source_group_id: "grp", teacher_verified: true } }] }; }));
    expect(s.blockers).toEqual([]);
    expect(s.projection[0]).toMatchObject({ target: "group_course_instances", participant_ids: [], headcount: 14, billing_ticket_items: 0 });
  });
  it("private session → 1 appointment, real participant joins, 1 billing line", () => {
    const p = sale(pkg()).projection[0];
    expect(p).toMatchObject({ target: "private_appointments", participant_ids: ["tp1", "tp2"], billing_ticket_items: 1, price_minor: 15000 });
  });
});

describe("scheduler acceptance (shape + shared collapse rule)", () => {
  it("one block per teaching session, no duplicates from billing joins", () => {
    const proj = sale(pkg()).projection;
    const rows = toSchedulerRows(proj);
    expect(rows.ticketItems.length).toBe(2);
    expect(rows.appointmentParticipants.length).toBe(4);
    const dup = [...rows.ticketItems, { ...rows.ticketItems[0], participant_id: "tp2" }];
    expect(collapseAppointmentRows(dup).length).toBe(2);
    const blocks = schedulerBlocks(proj);
    expect(blocks.map((b) => [b.date, b.start, b.instructor_id])).toEqual([["2026-12-28", "10:00:00", T1], ["2026-12-29", "10:00:00", T1]]);
  });
  it("unassigned sessions produce no scheduler row", () => {
    const proj = sale(pkg((p) => p.sales[0].items[0].sessions.forEach((s) => (s.teacher_source_id = null)))).projection;
    expect(schedulerBlocks(proj)).toEqual([]);
  });
});
