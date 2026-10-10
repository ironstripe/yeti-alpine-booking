import { describe, expect, test } from "bun:test";
import { customerEmailRecipient } from "../src/lib/customerEmail";

describe("customer without email", () => {
  test("no recipient when email is missing → confirmation skipped", () => {
    expect(customerEmailRecipient({ email: null })).toBeNull();
    expect(customerEmailRecipient({ email: "  " })).toBeNull();
    expect(customerEmailRecipient(null)).toBeNull();
  });
  test("known email is used", () => {
    expect(customerEmailRecipient({ email: " a@b.ch " })).toBe("a@b.ch");
  });
});
