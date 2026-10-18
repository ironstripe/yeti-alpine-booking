import { describe, expect, test } from "bun:test";
import { GROUP_LUNCH_PRICE_CHF, groupLunchEligible, uniqueLunchDates } from "../src/lib/groupLunch";
import { staffGroupTotal } from "../src/lib/staffGroupPayload";
const date = "2026-12-14";
const server = { courseId: "c", productId: "p", block: null, unitPrice: 150 };
const blocks = [{ date, startTime: "10:00", endTime: "12:00" }, { date, startTime: "14:00", endTime: "16:00" }];
describe("optional full-day group lunch", () => {
 test("CHF30 per participant/day", () => { expect(GROUP_LUNCH_PRICE_CHF).toBe(30); });
 test("full-day option uses AM and PM; independent of total minutes", () => {
  expect(groupLunchEligible({ server, blocks }, [date])).toBe(true);
  expect(groupLunchEligible({ server, blocks: [blocks[0], { ...blocks[1], endTime: "15:55" }] }, [date])).toBe(true);
 });
 test("half-day variants are not eligible even with misleading blocks", () => {
  expect(groupLunchEligible({ server: { ...server, block: "am" }, blocks }, [date])).toBe(false);
  expect(groupLunchEligible({ server: { ...server, block: "pm" }, blocks }, [date])).toBe(false);
 });
 test("incomplete/missing plan cannot opt in", () => {
  expect(groupLunchEligible({ server, blocks: [blocks[0]] }, [date])).toBe(false);
  expect(groupLunchEligible({ blocks }, [date])).toBe(false);
  expect(groupLunchEligible({ server, blocks }, [])).toBe(false);
 });
 test("selected dates are unique and belong to booked days", () => {
  expect(uniqueLunchDates([date, date, "2026-12-15"], [date])).toEqual([date]);
 });
 test("separate course/block lines cannot double-charge one person's lunch", () => {
  const line = { course_id: "c", product_id: "p", participant_id: "a", dates: [date], block: null, sport: "ski" as const, meeting_point: "Täli", expected_unit_price: 150, lunch_dates: [date, date], expected_lunch_unit_price: 30 };
  expect(staffGroupTotal([line, { ...line, course_id: "other" }])).toBe(330);
  expect(staffGroupTotal([line, { ...line, participant_id: "b" }])).toBe(360);
  expect(staffGroupTotal([{ ...line, lunch_dates: [] }])).toBe(150);
 });
});
