// B08: birth-date rule (real calendar date, not after the Europe/Zurich school date; today valid).
import { describe, expect, test } from "bun:test";
import { birthDateIssue, schoolToday, isRealDate, birthDateChangeError, pickerDateToIso } from "../src/lib/birthDate";

const noonZurich = new Date("2026-10-25T10:00:00Z");
describe("birthDateIssue", () => {
  test("today and past are valid, tomorrow and far future are not", () => {
    expect(birthDateIssue("2026-10-25", noonZurich)).toBeNull();
    expect(birthDateIssue("2015-01-01", noonZurich)).toBeNull();
    expect(birthDateIssue("2026-10-26", noonZurich)).toBe("future");
    expect(birthDateIssue("2999-01-01", noonZurich)).toBe("future");
  });
  test("impossible dates and bad formats are invalid; real leap day is valid", () => {
    expect(isRealDate("2027-02-30")).toBe(false);
    expect(isRealDate("2025-02-29")).toBe(false);
    expect(isRealDate("2024-02-29")).toBe(true);
    expect(birthDateIssue("2024-13-01", noonZurich)).toBe("invalid");
    expect(birthDateIssue("01.02.2015", noonZurich)).toBe("invalid");
    expect(birthDateIssue(null, noonZurich)).toBe("invalid");
  });
  test("day boundary follows Zurich, not UTC: 23:30 UTC on 25 Oct is already 26 Oct in Zurich (winter time)", () => {
    const late = new Date("2026-10-25T23:30:00Z");
    expect(schoolToday(late)).toBe("2026-10-26");
    expect(birthDateIssue("2026-10-26", late)).toBeNull();
    expect(schoolToday(new Date("2026-10-25T22:59:00Z"))).toBe("2026-10-25");
  });
});
describe("birthDateChangeError (edit forms)", () => {
  test("unchanged historic future value never blocks; NULL stays allowed; a changed future value fails", () => {
    expect(birthDateChangeError("2030-01-01", "2030-01-01", noonZurich)).toBeNull();
    expect(birthDateChangeError(null, null, noonZurich)).toBeNull();
    expect(birthDateChangeError("2026-11-01", "2015-01-01", noonZurich)).toBe("Das Geburtsdatum darf nicht in der Zukunft liegen.");
    expect(birthDateChangeError("2014-01-01", "2015-01-01", noonZurich)).toBeNull();
  });
  test("picker date keeps its local calendar day", () => {
    expect(pickerDateToIso(new Date(2015, 4, 5))).toBe("2015-05-05");
  });
});
