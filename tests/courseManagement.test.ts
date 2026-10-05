import { describe, expect, test } from "bun:test";
import { classifyInvoke, describeBlockingDependencies, isCourseRelatedQueryKey, isDeletable, needsReadback, outcomeMessage, resolveReadback, validateCourseName } from "../src/lib/courseManagement";

const httpErr = (status: number, body: unknown) => ({ name: "FunctionsHttpError", context: { status, json: async () => body } });
const reported: Record<string, number> = { enrollments: 0, original_course_refs: 0, event_refs: 0, source_period_links: 2, source_product_links: 2, instances: 20, dates: 10 };

describe("course dependencies", () => {
  test("technical source links and generated structure never block", () => {
    expect(isDeletable(reported)).toBe(true);
    expect(isDeletable({ instances: 98, groups: 20, source_period_links: 20, source_product_links: 1 })).toBe(true);
  });
  test("genuine usage blocks with counts", () => {
    expect(isDeletable({ participant_course_refs: 1 })).toBe(false);
    expect(describeBlockingDependencies({ enrollments: 2, assigned_groups: 1 })[0]).toContain("2 Kursanmeldungen");
  });
});

describe("uncertain outcomes", () => {
  test("network/server never claim unchanged without read-back", () => {
    expect(needsReadback({ kind: "network" })).toBe(true);
    expect(outcomeMessage({ kind: "network" })).not.toContain("unverändert");
    expect(outcomeMessage({ kind: "unknown" })).toContain("unbekannt");
  });
  test("read-back resolves", () => {
    expect(resolveReadback("delete", { kind: "network" }, null, false).kind).toBe("ok");
    expect(resolveReadback("delete", { kind: "network" }, { archived_at: null }, false)).toEqual({ kind: "network", verified: true });
    expect(resolveReadback("delete", { kind: "server" }, undefined, true).kind).toBe("unknown");
    expect(resolveReadback("archive", { kind: "server" }, { archived_at: "x" }, false).kind).toBe("ok");
  });
  test("cache invalidation covers scheduler/planning", () => {
    for (const k of ["scheduler-group-instances", "group-planning", "group-courses", "live-planning-my-groups"]) expect(isCourseRelatedQueryKey([k])).toBe(true);
    expect(isCourseRelatedQueryKey(["invoices"])).toBe(false);
  });
});

describe("classifyInvoke", () => {
  test("explicit ok only", async () => {
    expect((await classifyInvoke({ ok: true }, null)).kind).toBe("ok");
    expect((await classifyInvoke({}, null)).kind).toBe("server");
    expect((await classifyInvoke({ deleted: 0 }, null)).kind).toBe("server");
  });
  test("specific errors", async () => {
    const r = await classifyInvoke(null, httpErr(409, { error: "referenced", dependencies: reported }));
    expect(r.kind).toBe("referenced");
    expect(outcomeMessage(r)).toContain("Nichts wurde geändert");
    expect((await classifyInvoke(null, httpErr(404, { error: "not_found" }))).kind).toBe("not_found");
    expect((await classifyInvoke(null, httpErr(404, "Function not found"))).kind).toBe("not_installed");
    expect((await classifyInvoke(null, httpErr(503, { error: "not_installed" }))).kind).toBe("not_installed");
    expect((await classifyInvoke(null, httpErr(403, { error: "Forbidden" }))).kind).toBe("forbidden");
    expect((await classifyInvoke(null, httpErr(401, { error: "Unauthorized" }))).kind).toBe("unauthenticated");
    expect((await classifyInvoke(null, { name: "FunctionsFetchError" })).kind).toBe("network");
    expect((await classifyInvoke(null, httpErr(500, {}))).kind).toBe("server");
  });
});

test("validateCourseName", () => {
  expect(validateCourseName("  ", "A")).toMatch(/leer/);
  expect(validateCourseName(" A ", "A")).toMatch(/unverändert/);
  expect(validateCourseName("B", "A")).toBeNull();
});
