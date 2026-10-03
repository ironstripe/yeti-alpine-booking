import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { onlinePaymentGate } from "./paymentGate.ts";

Deno.test("online payment with a made-up reference is refused (503 payment_provider_unavailable)", () => {
  const r = onlinePaymentGate("online");
  assertEquals(r.allowed, false);
  if (!r.allowed) {
    assertEquals(r.status, 503);
    assertEquals(r.body.code, "payment_provider_unavailable");
  }
});

Deno.test("invoice flow is not gated", () => {
  assertEquals(onlinePaymentGate("invoice"), { allowed: true });
});

// Structural proof that the gate runs before ANY database access: in the handler
// the gate return must precede client creation, every .from/.rpc, finalization,
// the paid_amount update and the payments insert.
Deno.test("gate precedes every DB access, finalization and payment write in index.ts", async () => {
  const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const handler = src.slice(src.indexOf("Deno.serve("));
  const gateAt = handler.indexOf("if (!gate.allowed) return json(gate.body, gate.status);");
  assert(gateAt > 0, "gate return missing");
  for (const marker of [
    "createClient(",
    ".from(",
    ".rpc(",
    "finalize_provisional_reservation",
    "paid_amount: ticket.total_amount",
    '.from("payments").insert',
  ]) {
    const at = handler.indexOf(marker);
    assert(at === -1 || at > gateAt, `${marker} appears before the payment gate`);
  }
  const parseAt = handler.indexOf("Payload.safeParse(body)");
  assert(parseAt > 0 && parseAt < gateAt, "gate must run after validation but before DB");
});
