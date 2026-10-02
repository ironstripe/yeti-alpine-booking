import { describe, test as it, expect } from "bun:test";
import { validatePackage, type MigrationPackage, type Session } from "../src/lib/bcMigration/contract";
import { evaluatePackage, type EvalContext } from "../src/lib/bcMigration/evaluate";
import { privateSchedulerBlocks, toPrivateSchedulerRows } from "../src/lib/bcMigration/schedulerProjection";
import { collapseAppointmentRows } from "../src/lib/schedulerCollapse";

// Synthetic, non-personal fixture built in code (no real source data committed).
const T1 = "00000000-0000-4000-8000-000000000001";
const C1 = "00000000-0000-4000-8000-0000000000c1";
const P1 = "00000000-0000-4000-8000-0000000000a1";
const P2 = "00000000-0000-4000-8000-0000000000a2";
const ses = (o: Partial<Session> & { source_session_id: string; date: string }): Session => ({
  start: "10:00", end: "12:00", teacher_source_id: "t1", participant_source_ids: ["p1", "p2"], price_minor: 15000, group: null, headcount: null, ...o,
});
function pkg(over: (p: MigrationPackage) => void = () => {}): MigrationPackage {
  const p: MigrationPackage = {
    format: "yeti.bc-migration.normalized", version: 1,
    manifest: { source_system: "booking_corner", rollout: "yeti_2026_27", snapshot_id: "snap-1", exported_at: "2026-10-02T10:00:00Z", adapter: "synthetic-test" },
    participants: [{ source_participant_id: "p1", target_participant_id: P1 }, { source_participant_id: "p2", target_participant_id: P2 }],
    sales: [{
      source_sale_id: "s1", currency: "CHF", booking_status: "booked", source_balance_minor: 20000, source_customer_id: "c1", target_customer_id: C1,
      items: [{ source_item_id: "i1", kind: "private", source_status: "booked", amount_minor: 30000, roster_resolved: true, sessions: [
        ses({ source_session_id: "x1", date: "2026-12-28" }), ses({ source_session_id: "x2", date: "2026-12-29" }),
      ] }],
      invoices: [{ source_invoice_id: "inv1", kind: "invoice", number: "R-1", issue_date: "2026-11-01", due_date: "2026-11-30", currency: "CHF", total_minor: 30000,
        document_ref: "doc-1", payment_reference: "ref-1", source_status: "sent", sent_at: "2026-11-01", paid_at: null,
        allocations: [{ source_item_id: "i1", amount_minor: 30000 }], semantics_confirmed: true }],
      payments: [{ source_payment_id: "pay1", kind: "payment", amount_minor: 10000, date: "2026-11-05", currency: "CHF", invoice_source_id: "inv1", reference: null, semantics_confirmed: true }],
    }],
  };
  over(p);
  return p;
}
const ctx = (o: Partial<EvalContext> = {}): EvalContext => ({
  season: { start: "2026-12-01", end: "2027-04-15" },
  instructorLinks: new Map([["t1", [T1]]]), deploymentWindows: new Map([[T1, [{ from: "2026-12-01", until: "2027-04-15" }]]]),
  existingItems: [], absenceCheckAvailable: false, capabilityCheckAvailable: false,
  targetReferencesVerified: false, groupTargetMappingAvailable: false, ...o,
});
const sale = (p: MigrationPackage, c = ctx()) => evaluatePackage(p, c).sales[0];
const errs = (raw: unknown) => { const r = validatePackage(raw); return r.ok ? [] : r.errors; };
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

describe("contract validation is total", () => {
  it("accepts a valid package", () => expect(validatePackage(pkg()).ok).toBe(true));
  it("never throws on null/primitive/array nested values; returns stable path errors", () => {
    const bad: unknown[] = [null, 1, "x", [], undefined];
    for (const v of bad) {
      expect(() => validatePackage(v)).not.toThrow();
      for (const path of [["sales", 0], ["sales", 0, "items", 0], ["sales", 0, "items", 0, "sessions", 0], ["sales", 0, "invoices", 0], ["sales", 0, "payments", 0], ["participants", 0], ["manifest"]] as (string | number)[][]) {
        const p = clone(pkg()) as unknown as Record<string | number, unknown>;
        let o: Record<string | number, unknown> = p;
        for (const k of path.slice(0, -1)) o = o[k] as Record<string | number, unknown>;
        o[path[path.length - 1]] = v;
        let r: ReturnType<typeof validatePackage> | undefined;
        expect(() => { r = validatePackage(p); }).not.toThrow();
        expect(r!.ok).toBe(false);
      }
    }
  });
  it("missing nested fields produce path errors", () => {
    const p = clone(pkg()) as unknown as { sales: Record<string, unknown>[] };
    delete (p.sales[0].items as Record<string, unknown>[])[0].amount_minor;
    delete (p.sales[0].invoices as Record<string, unknown>[])[0].issue_date;
    delete (p.sales[0].payments as Record<string, unknown>[])[0].kind;
    delete (p.sales[0] as Record<string, unknown>).booking_status;
    const e = errs(p);
    expect(e).toContain("sales[0].items[0].amount_minor:missing");
    expect(e).toContain("sales[0].invoices[0].issue_date:missing");
    expect(e).toContain("sales[0].payments[0].kind:missing");
    expect(e).toContain("sales[0].booking_status:missing");
  });
  it("rejects unsafe/non-integer/negative minor units, bad booleans, bad UUIDs, dup refs, bad headcount", () => {
    const e = errs(pkg((p) => {
      p.sales[0].items[0].amount_minor = 2 ** 60;
      p.sales[0].items[0].sessions[0].price_minor = 12.5;
      p.sales[0].payments[0].amount_minor = -1;
      (p.sales[0].items[0] as unknown as Record<string, unknown>).roster_resolved = "yes";
      p.sales[0].target_customer_id = "tc1";
      p.sales[0].items[0].sessions[1].participant_source_ids = ["p1", "p1"];
      p.sales[0].items[0].sessions[1].headcount = 0;
      p.sales[0].items[0].sessions[1].source_session_id = "x1";
      p.sales[0].items[0].sessions[0].date = "2026-02-30";
    }));
    for (const c of ["items[0].amount_minor:not_safe_integer_minor", "sessions[0].price_minor:not_safe_integer_minor", "payments[0].amount_minor:negative",
      "roster_resolved:not_boolean", "target_customer_id:uuid_invalid", "participant_source_ids:duplicate_ref", "headcount:not_positive_integer", "duplicate_id", "date_invalid"])
      expect(e.join(" ")).toContain(c);
  });
  it("rejects unknown format/version", () => expect(validatePackage({ ...pkg(), version: 2 }).ok).toBe(false));
});

describe("import readiness", () => {
  it("no sale is ever import_ready; global blockers include unavailable checks", () => {
    const rep = evaluatePackage(pkg(), ctx());
    expect(rep.totals.import_ready).toBe(0);
    expect(rep.sales.every((s) => s.import_ready === false)).toBe(true);
    for (const g of ["absence_check_unavailable", "capability_check_unavailable", "target_reference_verification_unavailable:customers_participants",
      "collision_check_unavailable:group_course_instances", "collision_check_unavailable:instructor_absences", "collision_check_unavailable:source_source_overlaps"])
      expect(rep.global_blockers).toContain(g);
  });
  it("arbitrary target ids are not treated as verified", () => {
    const r = sale(pkg());
    expect(r.blockers).toContain("target_customer_unverified");
    expect(r.blockers).toContain("participant_target_unverified:x1");
    expect(r.status).toBe("blocked");
    expect(r.scheduler_state).toBe("blocked");
  });
  it("missing lifecycle status blocks preservation (never silently discarded)", () => {
    const r = sale(pkg((p) => { p.sales[0].booking_status = null; p.sales[0].items[0].source_status = null; p.sales[0].invoices[0].source_status = null; }));
    expect(r.blockers).toContain("booking_status_missing:preservation_unsupported");
    expect(r.blockers).toContain("item_status_missing:i1");
    expect(r.blockers).toContain("invoice_status_missing:preservation_unsupported:inv1");
    const ok = sale(pkg());
    expect(ok.finance.booking_status).toBe("booked");
    expect(ok.item_status).toEqual([{ source_item_id: "i1", kind: "private", source_status: "booked" }]);
  });
});

describe("evaluator", () => {
  it("exact UUID reuse via source id", () => expect(sale(pkg()).mappings).toEqual([{ source_teacher_id: "t1", instructor_id: T1 }]));
  it("missing amount is a blocker, never 0", () => {
    const r = sale(pkg((p) => { p.sales[0].items[0].amount_minor = null; }));
    expect(r.blockers).toContain("amount_missing:i1");
    expect(r.finance.items_total_minor).toBeNull();
    expect(r.finance.computed_rest_minor).toBeNull();
  });
  it("unknown/ambiguous teacher link blocks; no name fallback", () => {
    expect(sale(pkg(), ctx({ instructorLinks: new Map() })).blockers).toContain("teacher_link_missing:x1");
    expect(sale(pkg(), ctx({ instructorLinks: new Map([["t1", [T1, "other"]]]) })).blockers).toContain("teacher_link_ambiguous:x1");
    expect(evaluatePackage(pkg(), ctx({ instructorLinks: null })).global_blockers).toContain("instructor_mapping_unverifiable:source_links_not_readable");
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
    expect([r.sessions_in_scope, r.sessions_out_of_scope]).toEqual([1, 1]);
    expect(r.projection.map((s) => s.source_session_id)).toEqual(["x2"]);
  });
  it("multi-session private without explicit per-session price blocks", () => {
    expect(sale(pkg((p) => p.sales[0].items[0].sessions.forEach((s) => (s.price_minor = null)))).blockers).toContain("price_allocation_missing:i1");
  });
  it("teacher/time overlap is a collision CANDIDATE with exact ids, not a proven duplicate", () => {
    const rep = evaluatePackage(pkg(), ctx({ existingItems: [
      { id: "ti-1", ticket_id: "tk-1", date: "2026-12-28", time_start: "11:00:00", time_end: "13:00:00", instructor_id: T1, appointment_id: null },
      { id: "ti-2", ticket_id: "tk-2", date: "2027-01-03", time_start: "09:00:00", time_end: "10:00:00", instructor_id: T1, appointment_id: null },
    ] }));
    expect(rep.sales[0].collisions).toEqual([{ source_session_id: "x1", target_item_id: "ti-1", target_ticket_id: "tk-1", kind: "teacher_time_overlap_candidate" }]);
    expect(rep.sales[0].proposed_actions).toContain("review:collision_candidate:x1->ti-1");
    expect(rep.unmatched_existing_items).toEqual(["ti-2"]);
    expect(rep.totals.collision_candidates).toBe(1);
  });
  it("private session → 1 appointment, real participant joins, 1 billing line", () => {
    expect(sale(pkg()).projection[0]).toMatchObject({ target: "private_appointments", participant_ids: [P1, P2], billing_ticket_items: 1, price_minor: 15000 });
  });
});

describe("school and group are not natively projected", () => {
  it("school keeps kind/slot/headcount, is blocked, and emits no group_course_instances", () => {
    const r = sale(pkg((p) => { p.sales[0].items[0] = { source_item_id: "sc", kind: "school_group", source_status: "booked", amount_minor: 30000, roster_resolved: false,
      sessions: [ses({ source_session_id: "sx", date: "2027-01-05", start: "13:30", end: "15:30", participant_source_ids: [], price_minor: null, headcount: 14, group: { source_group_id: "grp", teacher_verified: true } })] }; }));
    expect(r.blockers).toContain("school_native_projection_unsupported:sc");
    expect(r.projection[0]).toMatchObject({ kind: "school_group", target: "school_unsupported", start: "13:30", end: "15:30", headcount: 14, participant_ids: [], billing_ticket_items: 0, source_group_id: "grp" });
    expect(JSON.stringify(r)).not.toContain("group_course_instances");
    expect(privateSchedulerBlocks(r.projection)).toEqual([]);
    expect(r.scheduler_state).toBe("blocked");
  });
  it("two sales in one class: one shared group entry, per-sale price retained, blocked, no scheduler rows", () => {
    const groupItem = (id: string, price: number) => ({ source_item_id: id, kind: "group" as const, source_status: "booked", amount_minor: price, roster_resolved: true,
      sessions: [ses({ source_session_id: `${id}-s`, date: "2027-01-04", participant_source_ids: [id === "ga" ? "p1" : "p2"], price_minor: price, group: { source_group_id: "class-7", teacher_verified: true } })] });
    const p = pkg((p) => {
      p.sales[0].items[0] = groupItem("ga", 30000);
      p.sales[0].invoices[0].allocations = [{ source_item_id: "ga", amount_minor: 30000 }];
      p.sales.push({ ...clone(p.sales[0]), source_sale_id: "s2", items: [groupItem("gb", 25000)],
        invoices: [{ ...clone(p.sales[0].invoices[0]), source_invoice_id: "inv2", total_minor: 25000, allocations: [{ source_item_id: "gb", amount_minor: 25000 }] }],
        payments: [{ ...p.sales[0].payments[0], source_payment_id: "pay2", invoice_source_id: "inv2" }] });
    });
    expect(validatePackage(p).ok).toBe(true);
    const rep = evaluatePackage(p, ctx());
    expect(rep.shared_groups).toEqual([{ source_group_id: "class-7", sale_ids: ["s1", "s2"], session_ids: ["ga-s", "gb-s"] }]);
    for (const s of rep.sales) {
      expect(s.blockers).toContain("group_target_mapping_unavailable:class-7");
      expect(s.projection[0].target).toBe("group_target_unmapped");
      expect(privateSchedulerBlocks(s.projection)).toEqual([]);
    }
    expect(rep.sales.map((s) => s.projection[0].price_minor)).toEqual([30000, 25000]);
    expect(rep.sales.map((s) => s.finance.items_total_minor)).toEqual([30000, 25000]);
  });
  it("group without identity blocks", () => {
    const r = sale(pkg((p) => { p.sales[0].items[0].kind = "saturday"; }));
    expect(r.blockers).toContain("group_identity_missing:x1");
    expect(r.blockers).toContain("group_teacher_unverified:x1");
  });
});

describe("finance", () => {
  it("original invoice identity and lifecycle evidence preserved", () => {
    expect(sale(pkg()).finance.original_invoices[0]).toEqual({ source_invoice_id: "inv1", kind: "invoice", number: "R-1", issue_date: "2026-11-01", due_date: "2026-11-30",
      currency: "CHF", total_minor: 30000, document_ref: "doc-1", payment_reference: "ref-1", source_status: "sent", sent_at: "2026-11-01", paid_at: null,
      allocations: [{ source_item_id: "i1", amount_minor: 30000 }] });
  });
  it("missing invoice number/document/due/reference block; nothing defaulted", () => {
    const r = sale(pkg((p) => Object.assign(p.sales[0].invoices[0], { number: null, document_ref: null, due_date: null, payment_reference: null })));
    for (const c of ["invoice_number_missing:inv1", "invoice_document_missing:inv1", "invoice_due_date_missing:inv1", "invoice_payment_reference_missing:inv1"]) expect(r.blockers).toContain(c);
    expect(r.finance.original_invoices[0]).toMatchObject({ number: null, due_date: null, document_ref: null, payment_reference: null });
  });
  it("partial invoice with explicit allocation is not money_inconsistent", () => {
    const r = sale(pkg((p) => {
      p.sales[0].items.push({ source_item_id: "i2", kind: "private", source_status: "booked", amount_minor: 5000, roster_resolved: true, sessions: [ses({ source_session_id: "x3", date: "2027-02-01", price_minor: 5000 })] });
    }));
    expect(r.finance.reconciliation).toBe("allocated");
    expect(r.blockers.some((b) => b.startsWith("money_inconsistent"))).toBe(false);
  });
  it("credit note with allocation nets against item; no allocation → reconciliation unavailable (not inconsistent)", () => {
    const withCredit = sale(pkg((p) => p.sales[0].invoices.push({ ...clone(p.sales[0].invoices[0]), source_invoice_id: "cn1", kind: "credit_note", total_minor: 5000, allocations: [{ source_item_id: "i1", amount_minor: 5000 }] })));
    expect(withCredit.blockers.some((b) => b.startsWith("money_inconsistent"))).toBe(false);
    const noAlloc = sale(pkg((p) => { p.sales[0].invoices[0].allocations = null; p.sales[0].invoices[0].total_minor = 29000; }));
    expect(noAlloc.finance.reconciliation).toBe("unavailable");
    expect(noAlloc.blockers).toContain("reconciliation_unavailable:invoice_allocation_missing");
    expect(noAlloc.blockers.some((b) => b.startsWith("money_inconsistent"))).toBe(false);
  });
  it("over-allocation beyond item is inconsistent", () => {
    const r = sale(pkg((p) => { p.sales[0].invoices[0].total_minor = 40000; p.sales[0].invoices[0].allocations = [{ source_item_id: "i1", amount_minor: 40000 }]; }));
    expect(r.blockers).toContain("money_inconsistent:invoiced_exceeds_item:i1");
  });
  it("overpayment retained as signed rest, unresolved treatment, not corrupt", () => {
    const r = sale(pkg((p) => { p.sales[0].payments[0].amount_minor = 35000; }));
    expect(r.finance.computed_rest_minor).toBe(-5000);
    expect(r.blockers).toContain("overpayment_treatment_unresolved");
    expect(r.blockers.some((b) => b.startsWith("money_inconsistent"))).toBe(false);
  });
  it("unconfirmed movements are not counted as settled", () => {
    const r = sale(pkg((p) => p.sales[0].payments.push({ source_payment_id: "r1", kind: "refund", amount_minor: 500, date: "2026-11-06", currency: "CHF", invoice_source_id: null, reference: null, semantics_confirmed: false })));
    expect(r.blockers).toContain("payment_semantics_unresolved:refund:r1");
    expect(r.finance.confirmed.refunded_minor).toBe(0);
    expect(r.finance.unconfirmed_minor).toEqual({ refund: 500 });
    expect(r.finance.computed_rest_minor).toBe(20000);
  });
  it("discount counted once", () => {
    const r = sale(pkg((p) => p.sales[0].payments.push({ source_payment_id: "d1", kind: "discount", amount_minor: 2000, date: "2026-11-01", currency: "CHF", invoice_source_id: null, reference: null, semantics_confirmed: true })));
    expect(r.finance.confirmed).toEqual({ discount_minor: 2000, paid_minor: 10000, refunded_minor: 0, credit_minor: 0 });
    expect(r.finance.computed_rest_minor).toBe(18000);
  });
});

describe("private scheduler acceptance (shared collapse rule; private only)", () => {
  it("one block per private lesson, no duplicates from billing joins", () => {
    const proj = sale(pkg()).projection;
    const rows = toPrivateSchedulerRows(proj);
    expect(rows.ticketItems.length).toBe(2);
    expect(rows.appointmentParticipants.length).toBe(4);
    expect(collapseAppointmentRows([...rows.ticketItems, { ...rows.ticketItems[0], participant_id: P2 }]).length).toBe(2);
    expect(privateSchedulerBlocks(proj).map((b) => [b.date, b.start, b.instructor_id])).toEqual([["2026-12-28", "10:00:00", T1], ["2026-12-29", "10:00:00", T1]]);
  });
  it("unassigned sessions produce no scheduler row", () => {
    expect(privateSchedulerBlocks(sale(pkg((p) => p.sales[0].items[0].sessions.forEach((s) => (s.teacher_source_id = null)))).projection)).toEqual([]);
  });
});

describe("no side effects", () => {
  it("evaluation does not mutate the package or context and is deterministic", () => {
    const p = pkg(); const before = JSON.stringify(p);
    const c = ctx(); const linksBefore = JSON.stringify([...c.instructorLinks!]);
    const a = JSON.stringify(evaluatePackage(p, c)); const b = JSON.stringify(evaluatePackage(p, c));
    expect(a).toBe(b);
    expect(JSON.stringify(p)).toBe(before);
    expect(JSON.stringify([...c.instructorLinks!])).toBe(linksBefore);
  });
  it("modules contain no I/O", async () => {
    const fs = await import("node:fs");
    for (const f of ["contract", "evaluate", "schedulerProjection"]) {
      const src = fs.readFileSync(`src/lib/bcMigration/${f}.ts`, "utf8");
      expect(src).not.toMatch(/supabase|fetch\(|localStorage|console\./);
    }
  });
});
