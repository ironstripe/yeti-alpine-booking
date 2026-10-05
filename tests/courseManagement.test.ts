import { describe, expect, test } from "bun:test";
import { classifyInvoke, describeBlockingDependencies, isDeletable, outcomeMessage, validateCourseName } from "../src/lib/courseManagement";

const httpErr = (status: number, body: unknown) => ({ name: "FunctionsHttpError", context: { status, json: async () => body } });
const reported = { enrollments: 0, original_course_refs: 0, event_refs: 0, source_period_links: 2, source_product_links: 2, instances: 20, dates: 10 };

describe("course dependencies", () => {
  test("reported Saturday adult course: source links block, instances/dates alone do not", () => {
    expect(isDeletable(reported)).toBe(false);
    expect(describeBlockingDependencies(reported)).toEqual([
      "2 Import-Periodenverknüpfungen (26/27)", "2 Import-Produktverknüpfungen (26/27)",
    ]);
    expect(isDeletable({ instances: 20, dates: 10 })).toBe(true);
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
    expect(outcomeMessage(r)).toContain("Import-Periodenverknüpfungen");
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
