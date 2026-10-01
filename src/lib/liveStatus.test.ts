import { describe, it, expect } from "vitest";
import { isExternalStatusChange } from "./liveStatus";

// Realistic realtime payloads with REPLICA IDENTITY DEFAULT: `old` holds only the primary key.
const oldPkOnly = { instructor_id: "a1" } as Record<string, unknown>;

describe("isExternalStatusChange", () => {
  it("does not flag when old payload has only instructor_id and status equals the shown status", () => {
    const incoming = { instructor_id: "a1", real_time_status: "available" };
    expect(oldPkOnly.real_time_status).toBeUndefined();
    expect(isExternalStatusChange(incoming.real_time_status, "available", null)).toBe(false);
  });

  it("flags a genuinely different status from another device", () => {
    expect(isExternalStatusChange("on_course", "available", null)).toBe(true);
  });

  it("does not flag the status this device just set (event may arrive before the refetch)", () => {
    expect(isExternalStatusChange("on_course", "available", "on_course")).toBe(false);
  });

  it("does not flag before anything is loaded or when status is missing", () => {
    expect(isExternalStatusChange("on_course", undefined, null)).toBe(false);
    expect(isExternalStatusChange(undefined, "available", null)).toBe(false);
  });
});
