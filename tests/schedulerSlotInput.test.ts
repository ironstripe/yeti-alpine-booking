import { describe, expect, test } from "bun:test";
import { getDesktopSlotIntent } from "../src/lib/schedulerSlotInput";

const desktopFreeSlot = { isMobile: false, isEligible: true };

describe("desktop scheduler free-slot input intent", () => {
  test("plain left mouse-down starts drag selection", () => {
    expect(getDesktopSlotIntent({ ...desktopFreeSlot, button: 0 })).toBe("drag");
  });

  test("Ctrl-left toggles the slot", () => {
    expect(getDesktopSlotIntent({ ...desktopFreeSlot, button: 0, ctrlKey: true })).toBe("toggle");
  });

  test("Meta-left toggles the slot", () => {
    expect(getDesktopSlotIntent({ ...desktopFreeSlot, button: 0, metaKey: true })).toBe("toggle");
  });

  test("left mouse-down toggles while multi-select mode is enabled", () => {
    expect(getDesktopSlotIntent({ ...desktopFreeSlot, button: 0, multiSelectMode: true })).toBe("toggle");
  });

  test("right mouse-down toggles the slot", () => {
    expect(getDesktopSlotIntent({ ...desktopFreeSlot, button: 2 })).toBe("toggle");
  });

  test("mobile and ineligible slots have no desktop action", () => {
    expect(getDesktopSlotIntent({ ...desktopFreeSlot, button: 0, isMobile: true })).toBe("none");
    expect(getDesktopSlotIntent({ ...desktopFreeSlot, button: 2, isEligible: false })).toBe("none");
  });
});