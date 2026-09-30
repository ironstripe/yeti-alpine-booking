// deno test --node-modules-dir=none --no-check supabase/functions/_shared/bookingDelivery.test.ts
import { confirmationKey, fillTemplate, placeholders } from "./bookingDelivery.ts";
const eq = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

Deno.test("fills flat vars with HTML escaping", () => {
  const r = fillTemplate("<p>{{ ticket_number }} {{customer_last_name}}</p>", { ticket_number: "T-1", customer_last_name: "<b>&" }, true);
  eq(r.text, "<p>T-1 &lt;b&gt;&amp;</p>"); eq(r.unknown, []);
});
Deno.test("plain text is not escaped", () => {
  eq(fillTemplate("{{a}}", { a: "<x>" }, false).text, "<x>");
});
Deno.test("unknown placeholders are reported, not dropped", () => {
  const r = fillTemplate("{{a}} {{invoice.number}}", { a: "1" }, true);
  eq(r.unknown, ["invoice.number"]); eq(r.text, "1 {{invoice.number}}");
});
Deno.test("placeholders deduplicated", () => eq(placeholders("{{a}}{{ a }}{{b}}"), ["a", "b"]));
Deno.test("idempotency key is stable per ticket", () =>
  eq(confirmationKey("abc"), "ticket:abc:booking_confirmation"));
