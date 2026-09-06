// Automated integration tests for the public reservation/confirmation contract.
// Creates temporary reservations against the live endpoints and cleans up afterwards.
// Guarded by the intake API key.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/intakeAuth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_KEY = Deno.env.get("YETI_INTAKE_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const results: Array<{ name: string; pass: boolean; detail?: unknown }> = [];
const createdTickets: string[] = [];
const createdCustomerEmails: string[] = [];

function check(name: string, pass: boolean, detail?: unknown) {
  results.push({ name, pass, detail: pass ? undefined : detail });
}

async function call(fn: string, body: unknown) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  let payload: any = null;
  try { payload = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body: payload };
}

function futureDate(offsetDays: number) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const CONSENT = {
  agb_accepted: true as const,
  agb_version: "test-1",
  privacy_accepted: true as const,
  privacy_version: "test-1",
  accepted_at: new Date().toISOString(),
};

function customer(email: string) {
  return {
    first_name: "Test", last_name: "Kunde", email,
    phone: "+41 79 000 00 00", street: "Teststrasse 1", zip: "9490", city: "Vaduz", country: "CH",
  };
}

function participants(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    first_name: `Kind${i + 1}`, last_name: "Kunde",
    birth_date: "2015-05-0" + (i + 1), discipline: "ski" as const, skill_level: "blau",
  }));
}

async function reserve(productId: string, count: number, day: number, hour = 9) {
  return await call("create-reservation", {
    source: "website",
    product_id: productId,
    participant_count: count,
    hold_minutes: 15,
    items: [{ date: futureDate(day), time_start: `${String(hour).padStart(2, "0")}:00`, time_end: `${String(hour + 1).padStart(2, "0")}:00` }],
    consent: CONSENT,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.headers.get("x-api-key") !== API_KEY) return json({ error: "Unauthorized" }, 401);

  const { product_id } = await req.json().catch(() => ({ product_id: null as string | null }));
  if (!product_id) return json({ error: "product_id required" }, 400);

  const stamp = Date.now();

  try {
    // --- 1. Anonymous reservation ---
    const r1 = await reserve(product_id, 2, 30, 9);
    const t1 = r1.body?.ticket_id;
    if (t1) createdTickets.push(t1);
    check("anonymous reservation created", r1.status === 201 && !!t1, r1);

    if (t1) {
      const { data: ticket } = await supabase.from("tickets")
        .select("customer_id, participant_count, status, total_amount").eq("id", t1).single();
      const { data: items } = await supabase.from("ticket_items")
        .select("id, participant_id, instructor_id, date, time_start").eq("ticket_id", t1);
      check("no customer on hold", ticket?.customer_id === null, ticket);
      check("participant_count stored", ticket?.participant_count === 2, ticket);
      check("capacity items created", (items?.length ?? 0) === 2, items?.length);
      check("items have no participant", (items ?? []).every((i) => i.participant_id === null), items);
      check("instructor assigned", (items ?? []).every((i) => !!i.instructor_id), items);

      const { count: fakeC } = await supabase.from("customers")
        .select("id", { count: "exact", head: true }).ilike("email", "reservierung+%@schneesportschule.li");
      const { count: fakeP } = await supabase.from("customer_participants")
        .select("id", { count: "exact", head: true }).ilike("first_name", "Teilnehmer%");
      check("no placeholder customers exist", (fakeC ?? 0) === 0, fakeC);
      check("no placeholder participants exist", (fakeP ?? 0) === 0, fakeP);

      // --- 3. Online without reference ---
      const email1 = `test.invoice.${stamp}@example.com`;
      createdCustomerEmails.push(email1);
      const noRef = await call("confirm-booking", {
        ticket_id: t1, reservation_token: r1.body.reservation_token,
        payment_method: "online", customer: customer(email1), participants: participants(2),
      });
      check("online without reference rejected", noRef.status === 400 && noRef.body?.code === "payment_reference_required", noRef);
      const { data: afterNoRef } = await supabase.from("tickets").select("status, customer_id").eq("id", t1).single();
      check("ticket unchanged after missing reference", afterNoRef?.status === "provisional" && afterNoRef?.customer_id === null, afterNoRef);

      // --- 6. Participant count mismatch ---
      const mismatch = await call("confirm-booking", {
        ticket_id: t1, reservation_token: r1.body.reservation_token,
        payment_method: "invoice", customer: customer(email1), participants: participants(1),
      });
      check("participant count mismatch rejected", mismatch.status === 422, mismatch);
      const { data: afterMismatch } = await supabase.from("tickets").select("status, customer_id").eq("id", t1).single();
      check("no partial changes after mismatch", afterMismatch?.customer_id === null && afterMismatch?.status === "provisional", afterMismatch);
      const { count: cAfterMismatch } = await supabase.from("customers")
        .select("id", { count: "exact", head: true }).eq("email", email1);
      check("no customer created on mismatch", (cAfterMismatch ?? 0) === 0, cAfterMismatch);

      // --- 2. Invoice confirmation ---
      const inv = await call("confirm-booking", {
        ticket_id: t1, reservation_token: r1.body.reservation_token,
        payment_method: "invoice", customer: customer(email1), participants: participants(2),
        notes: "Testbuchung",
      });
      check("invoice confirmation ok", inv.status === 200 && inv.body?.status === "invoice_pending", inv);
      const { data: invTicket } = await supabase.from("tickets").select("status, customer_id, paid_amount").eq("id", t1).single();
      check("real customer attached", !!invTicket?.customer_id, invTicket);
      check("invoice booking not paid", Number(invTicket?.paid_amount ?? 0) === 0, invTicket);
      const { data: invItems } = await supabase.from("ticket_items")
        .select("participant_id, instructor_id, date, time_start").eq("ticket_id", t1);
      check("participants attached to items", (invItems ?? []).every((i) => !!i.participant_id), invItems);
      check("distinct participants per slot", new Set((invItems ?? []).map((i) => i.participant_id)).size === 2, invItems);
      check("slot data unchanged", (invItems ?? []).every((i) => i.date === futureDate(30)), invItems);
      const { count: invCount } = await supabase.from("invoices").select("id", { count: "exact", head: true }).eq("ticket_id", t1);
      check("exactly one invoice", invCount === 1, invCount);

      // --- 8. Idempotency ---
      const inv2 = await call("confirm-booking", {
        ticket_id: t1, reservation_token: r1.body.reservation_token,
        payment_method: "invoice", customer: customer(email1), participants: participants(2),
      });
      check("repeat confirm idempotent", inv2.status === 200, inv2);
      const { count: invCount2 } = await supabase.from("invoices").select("id", { count: "exact", head: true }).eq("ticket_id", t1);
      const { count: partCount } = await supabase.from("customer_participants")
        .select("id", { count: "exact", head: true }).eq("customer_id", invTicket!.customer_id!);
      const { count: itemCount } = await supabase.from("ticket_items").select("id", { count: "exact", head: true }).eq("ticket_id", t1);
      check("no duplicate invoice", invCount2 === 1, invCount2);
      check("no duplicate participants", partCount === 2, partCount);
      check("no duplicate items", itemCount === 2, itemCount);
    }

    // --- 4/5. Online payment paths (existing customer reuse) ---
    const r2 = await reserve(product_id, 1, 31, 10);
    const t2 = r2.body?.ticket_id;
    if (t2) createdTickets.push(t2);
    check("second reservation created", r2.status === 201 && !!t2, r2);

    if (t2) {
      const emailExisting = createdCustomerEmails[0];
      const failed = await call("confirm-booking", {
        ticket_id: t2, reservation_token: r2.body.reservation_token,
        payment_method: "online", payment_failed: true,
        customer: customer(emailExisting), participants: participants(1),
      });
      check("failed payment keeps hold", failed.status === 402, failed);
      const { data: tf } = await supabase.from("tickets").select("status").eq("id", t2).single();
      check("status payment_pending after failure", tf?.status === "payment_pending", tf);
      const { count: payFail } = await supabase.from("payments").select("id", { count: "exact", head: true }).eq("ticket_id", t2);
      check("no payment on failure", (payFail ?? 0) === 0, payFail);

      const ok = await call("confirm-booking", {
        ticket_id: t2, reservation_token: r2.body.reservation_token,
        payment_method: "online", payment_reference: `TEST-REF-${stamp}`,
        customer: customer(emailExisting), participants: participants(1),
      });
      check("online payment confirms", ok.status === 200 && ok.body?.status === "confirmed", ok);
      const { count: payCount } = await supabase.from("payments").select("id", { count: "exact", head: true }).eq("ticket_id", t2);
      check("exactly one payment", payCount === 1, payCount);

      // existing customer reuse
      const { count: dupCustomers } = await supabase.from("customers")
        .select("id", { count: "exact", head: true }).eq("email", emailExisting);
      check("existing customer reused", dupCustomers === 1, dupCustomers);

      // repeat online confirm -> idempotent
      const ok2 = await call("confirm-booking", {
        ticket_id: t2, reservation_token: r2.body.reservation_token,
        payment_method: "online", payment_reference: `TEST-REF-${stamp}`,
        customer: customer(emailExisting), participants: participants(1),
      });
      const { count: payCount2 } = await supabase.from("payments").select("id", { count: "exact", head: true }).eq("ticket_id", t2);
      check("repeat online confirm idempotent", ok2.status === 200 && payCount2 === 1, { ok2, payCount2 });
    }

    // --- 7. Expired reservation ---
    const r3 = await reserve(product_id, 1, 32, 11);
    const t3 = r3.body?.ticket_id;
    if (t3) {
      createdTickets.push(t3);
      await supabase.from("tickets")
        .update({ reservation_expires_at: new Date(Date.now() - 60000).toISOString() }).eq("id", t3);
      const emailExp = `test.expired.${stamp}@example.com`;
      createdCustomerEmails.push(emailExp);
      const exp = await call("confirm-booking", {
        ticket_id: t3, reservation_token: r3.body.reservation_token,
        payment_method: "invoice", customer: customer(emailExp), participants: participants(1),
      });
      check("expired reservation rejected", exp.status === 410 && exp.body?.code === "expired", exp);
      const { count: expCust } = await supabase.from("customers").select("id", { count: "exact", head: true }).eq("email", emailExp);
      const { count: expPay } = await supabase.from("payments").select("id", { count: "exact", head: true }).eq("ticket_id", t3);
      check("no customer/payment on expired", (expCust ?? 0) === 0 && (expPay ?? 0) === 0, { expCust, expPay });
    }
  } catch (e) {
    check("unexpected error", false, (e as Error).message);
  } finally {
    // cleanup
    for (const t of createdTickets) {
      await supabase.from("payments").delete().eq("ticket_id", t);
      await supabase.from("invoices").delete().eq("ticket_id", t);
      await supabase.from("booking_consents").delete().eq("ticket_id", t);
      await supabase.from("ticket_items").delete().eq("ticket_id", t);
      await supabase.from("tickets").delete().eq("id", t);
    }
    for (const email of createdCustomerEmails) {
      const { data: c } = await supabase.from("customers").select("id").eq("email", email).maybeSingle();
      if (c) {
        await supabase.from("customer_participants").delete().eq("customer_id", c.id);
        await supabase.from("customers").delete().eq("id", c.id);
      }
    }
  }

  const failed = results.filter((r) => !r.pass);
  return json({ passed: results.length - failed.length, failed: failed.length, results }, failed.length ? 500 : 200);
});
