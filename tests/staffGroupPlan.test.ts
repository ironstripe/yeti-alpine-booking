import { describe, expect, test } from "bun:test";
import { sameGroupPlan, serverOptionKey, serverOptionToBookable, groupCourseEmptyMessageFor, type ServerGroupOption } from "../src/lib/groupCoursePlan";
import { buildStaffGroupLines, staffGroupTotal } from "../src/lib/staffGroupPayload";
import { itemReadinessIssues } from "../src/lib/wizardReadiness";
import { createEmptyCartItem, type BookingWizardState } from "../src/contexts/BookingWizardContext";

const WEEK = ["2026-12-14", "2026-12-15", "2026-12-16", "2026-12-17", "2026-12-18"];
const opt = (o: Partial<ServerGroupOption> = {}): ServerGroupOption => ({
  course_id: "c1", course_name: "26/27 Ski Blauer König", discipline: "ski", skill_level_id: "blue_king", meeting_point: "Täli",
  max_participants: 2, sort_order: 1, product_id: "p4", product_name: "Kinder Ganztag", duration_minutes: 240, block: null,
  blocks: WEEK.flatMap((date) => [{ date, time_start: "10:00", time_end: "12:00" }, { date, time_start: "14:00", time_end: "16:00" }]),
  unit_price: 320, ...o,
});

describe("26/27 server group options", () => {
  test("option keeps every AM/PM block, exact price and a stable key", () => {
    const b = serverOptionToBookable(opt());
    expect(b.id).toBe(serverOptionKey(opt()));
    expect(b.blocks).toHaveLength(10);
    expect(b.server).toEqual({ courseId: "c1", productId: "p4", block: null, unitPrice: 320 });
    expect(b.persistenceBlocker).toBeNull();
    expect(serverOptionToBookable(opt({ block: "am", duration_minutes: 120 })).product?.name).toContain("Vormittag");
  });
  test("sameGroupPlan compares full content, not block count", () => {
    const a = { courseId: "x", productName: "P", meetingPoint: "Täli", blocks: [{ date: "2026-12-14", startTime: "10:00", endTime: "12:00" }], persistenceBlocker: null, server: null };
    expect(sameGroupPlan(a, { ...a })).toBe(true);
    expect(sameGroupPlan(a, { ...a, blocks: [{ date: "2026-12-15", startTime: "10:00", endTime: "12:00" }] })).toBe(false);
    expect(sameGroupPlan(a, { ...a, blocks: [{ date: "2026-12-14", startTime: "14:00", endTime: "16:00" }] })).toBe(false);
    expect(sameGroupPlan(a, { ...a, meetingPoint: "Gorfion" })).toBe(false);
    expect(sameGroupPlan(a, { ...a, server: { courseId: "c", productId: "p", block: null, unitPrice: 1 } })).toBe(false);
  });
  test("empty message distinguishes installed / not installed / error", () => {
    expect(groupCourseEmptyMessageFor(WEEK, "ski", "installed")).toContain("nicht aktiv");
    expect(groupCourseEmptyMessageFor(WEEK, "ski", "not_installed")).toContain("noch nicht aktiv");
    expect(groupCourseEmptyMessageFor(WEEK, "ski", "error")).toContain("erneut");
  });
});

function groupState(over: Partial<BookingWizardState> = {}): BookingWizardState {
  const item = { ...createEmptyCartItem(), id: "i1", productType: "group" as const, assignedParticipantIds: ["pa", "guest-1"] };
  const server = serverOptionToBookable(opt()).server!;
  return {
    productType: "group", sport: "ski", selectedDates: WEEK, cartItems: [item], activeCartItemId: "i1",
    useParticipantSpecificBooking: false, participantBookings: {}, lunchSelections: {},
    selectedParticipants: [
      { id: "pa", first_name: "Anna", last_name: null, birth_date: "2016-01-01", level_last_season: null, level_current_season: null },
      { id: "guest-1", first_name: "Ben", last_name: "B", birth_date: "2017-01-01", level_last_season: null, level_current_season: null, isGuest: true },
    ],
    groupPlan: { courseId: serverOptionKey(opt()), courseName: "x", productName: "y", meetingPoint: "Täli", blocks: [], persistenceBlocker: null, server },
    ...over,
  } as unknown as BookingWizardState;
}

describe("staff group payload", () => {
  test("shared plan: one line per assigned participant, existing id or explicit new person", () => {
    const r = buildStaffGroupLines(groupState());
    expect(r.kind).toBe("server");
    if (r.kind !== "server") return;
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0]).toMatchObject({ participant_id: "pa", course_id: "c1", product_id: "p4", block: null, expected_unit_price: 320, dates: WEEK });
    expect(r.lines[1].guest).toMatchObject({ guest_key: "guest-1", first_name: "Ben", birth_date: "2017-01-01" });
    expect(staffGroupTotal(r.lines)).toBe(640);
  });
  test("only assigned participants, never all customer participants", () => {
    const s = groupState();
    (s.selectedParticipants as unknown[]).push({ id: "pc", first_name: "Cleo", birth_date: "2018-01-01" });
    const r = buildStaffGroupLines(s);
    expect(r.kind === "server" && r.lines.map((l) => l.participant_id ?? l.guest?.guest_key)).toEqual(["pa", "guest-1"]);
  });
  test("mixed 26/27 and legacy, multi-item cart and lunch are refused explicitly", () => {
    const mixed = groupState({ useParticipantSpecificBooking: true, participantBookings: {
      pa: { groupServer: { courseId: "c1", productId: "p4", block: null, unitPrice: 320 }, dates: WEEK },
      "guest-1": { groupServer: null, dates: WEEK, groupCourseId: "legacy" },
    } } as never);
    expect(buildStaffGroupLines(mixed).kind).toBe("error");
    const s = groupState(); s.cartItems = [...s.cartItems, { ...createEmptyCartItem(), id: "i2" }];
    expect(buildStaffGroupLines(s).kind).toBe("error");
    // Lunch without an authoritative price is refused, never dropped or priced by guess.
    expect(buildStaffGroupLines(groupState({ lunchSelections: { pa: ["2026-12-14"] } })).kind).toBe("error");
  });
  test("lunch days + vegetarian go to the matching participant line with the authoritative price", () => {
    const r = buildStaffGroupLines(groupState({ lunchSelections: { pa: ["2026-12-16", "2026-12-14"] }, vegetarianSelections: { pa: true } } as never), 30);
    expect(r.kind).toBe("server"); if (r.kind !== "server") return;
    expect(r.lines[0]).toMatchObject({ lunch_dates: ["2026-12-14", "2026-12-16"], vegetarian: true, expected_lunch_unit_price: 30 });
    expect(r.lines[1].lunch_dates).toBeUndefined();
    expect(staffGroupTotal(r.lines)).toBe(640 + 60);
  });
  test("meeting point: course value wins; missing course value needs explicit choice", () => {
    const r = buildStaffGroupLines(groupState({ meetingPoint: "malbipark" } as never));
    expect(r.kind === "server" && r.lines[0].meeting_point).toBe("Täli");
    const noCourse = (mp: string | null) => groupState({ meetingPoint: mp, groupPlan: { ...groupState().groupPlan!, meetingPoint: null } } as never);
    expect(buildStaffGroupLines(noCourse(null)).kind).toBe("error");
    const ok = buildStaffGroupLines(noCourse("kasse_taeli"));
    expect(ok.kind === "server" && ok.lines.map((l) => l.meeting_point)).toEqual(["kasse_taeli", "kasse_taeli"]);
    const per = buildStaffGroupLines(groupState({ useParticipantSpecificBooking: true, participantBookings: {
      pa: { groupServer: { courseId: "c1", productId: "p4", block: null, unitPrice: 320 }, dates: WEEK, groupMeetingPoint: null, groupMeetingPointChoice: "malbipark", lunchDays: [] },
      "guest-1": { groupServer: { courseId: "c2", productId: "p4", block: null, unitPrice: 320 }, dates: WEEK, groupMeetingPoint: "Täli", lunchDays: [] },
    } } as never));
    expect(per.kind === "server" && per.lines.map((l) => l.meeting_point)).toEqual(["malbipark", "Täli"]);
  });
  test("per-participant different courses map to their own course and dates", () => {
    const r = buildStaffGroupLines(groupState({ useParticipantSpecificBooking: true, participantBookings: {
      pa: { groupServer: { courseId: "c1", productId: "p4", block: null, unitPrice: 320 }, dates: WEEK, groupMeetingPoint: "Täli" },
      "guest-1": { groupServer: { courseId: "c2", productId: "p2", block: "pm", unitPrice: 70 }, dates: ["2026-12-15"], groupMeetingPoint: null, groupMeetingPointChoice: "malbipark" },
    } } as never));
    expect(r.kind === "server" && r.lines.map((l) => `${l.course_id}:${l.block}:${l.dates.length}`)).toEqual(["c1:null:5", "c2:pm:1"]);
  });
  test("legacy-only group is left to the existing path", () => {
    expect(buildStaffGroupLines(groupState({ groupPlan: { courseId: "legacy", courseName: "", productName: null, meetingPoint: null, blocks: [], persistenceBlocker: null } } as never)).kind).toBe("none");
  });
});

describe("group readiness", () => {
  test("group: course without meeting point requires an explicit choice; course value or choice suffices", () => {
    const item = { ...createEmptyCartItem(), id: "i1", productType: "group" as const, sport: "ski" as const, selectedDates: WEEK, assignedParticipantIds: ["pa"], selectedGroupId: "k", groupPlan: { courseId: "k", courseName: "x", productName: null, meetingPoint: null, blocks: [], persistenceBlocker: null }, meetingPoint: null };
    expect(itemReadinessIssues(item as never, 0).map((i) => i.field)).toEqual(["meetingPoint"]);
    expect(itemReadinessIssues({ ...item, meetingPoint: "malbipark" } as never, 0)).toEqual([]);
    expect(itemReadinessIssues({ ...item, groupPlan: { ...item.groupPlan, meetingPoint: "Täli" } } as never, 0)).toEqual([]);
  });
});

describe("draft (local) participants reach the server as new people with their own data", () => {
  test("per-person: local id keeps its course, dates, lunch + vegetarian; active cart ids retained", async () => {
    const { resolveLinkedParticipants } = await import("../src/lib/linkedParticipants");
    const XMAS = ["2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24", "2026-12-25"];
    const base = groupState();
    const draft = {
      ...base,
      cartItems: [{ ...base.cartItems[0], assignedParticipantIds: ["pa", "local-9"] }],
      localParticipants: [{ id: "local-9", first_name: "Lia", last_name: null, birth_date: "2019-05-05", skill_level: null, sport: "snowboard" }],
      selectedParticipants: [base.selectedParticipants[0]],
      useParticipantSpecificBooking: true,
      participantBookings: {
        pa: { groupServer: { courseId: "c1", productId: "p4", block: null, unitPrice: 320 }, dates: WEEK, groupMeetingPoint: "Täli", lunchDays: [] },
        "local-9": { groupServer: { courseId: "c2", productId: "p2", block: "pm", unitPrice: 230 }, dates: XMAS, groupMeetingPoint: null, groupMeetingPointChoice: "malbipark", lunchDays: ["2026-12-22", "2026-12-14"], isVegetarian: true },
      },
    } as unknown as BookingWizardState;
    const { linked, unresolved } = resolveLinkedParticipants(draft);
    expect(unresolved).toBe(false);
    expect(linked.map((p) => p.id)).toEqual(["pa", "local-9"]);
    const r = buildStaffGroupLines({ ...draft, selectedParticipants: linked }, 30);
    expect(r.kind).toBe("server"); if (r.kind !== "server") return;
    expect(r.lines[1]).toMatchObject({
      course_id: "c2", product_id: "p2", block: "pm", dates: XMAS, expected_unit_price: 230, meeting_point: "malbipark",
      lunch_dates: ["2026-12-22"], vegetarian: true, expected_lunch_unit_price: 30,
      guest: { guest_key: "local-9", first_name: "Lia", birth_date: "2019-05-05", sport: "snowboard" },
    });
    expect(r.lines[1].participant_id).toBeUndefined();
    expect(staffGroupTotal(r.lines)).toBe(320 + 230 + 30);
    // Draft data untouched (nothing rewritten on resolve).
    expect(draft.cartItems[0].assignedParticipantIds).toEqual(["pa", "local-9"]);
    expect(draft.localParticipants).toHaveLength(1);
  });
  test("removed local person -> unresolved, no line built for a ghost", async () => {
    const { resolveLinkedParticipants } = await import("../src/lib/linkedParticipants");
    const base = groupState();
    const s = { ...base, cartItems: [{ ...base.cartItems[0], assignedParticipantIds: ["pa", "local-gone"] }], localParticipants: [] } as unknown as BookingWizardState;
    expect(resolveLinkedParticipants(s).unresolved).toBe(true);
  });
});
