import test from "node:test";
import assert from "node:assert/strict";
import { customerReturnUrl } from "./customerReturnUrl.ts";

test("preserves only the customer search query", () => {
  assert.equal(customerReturnUrl("/customers?q=Anna%20M"), "/customers?q=Anna%20M");
  assert.equal(customerReturnUrl("/customers?other=1&q=Max"), "/customers?q=Max");
});

test("falls back for deep links and untrusted destinations", () => {
  for (const value of [null, undefined, {}, "//evil.example", "https://evil.example/customers", "/customers/other", "/bookings", "/customers-evil"]) {
    assert.equal(customerReturnUrl(value), "/customers");
  }
});
