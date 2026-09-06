import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { issueInvoice, previewRouting } from "../_shared/invoice-service.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const service = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // --- Authentication: validate the JWT in code ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Nicht angemeldet." }, 401);

    const { data: userData, error: userError } = await service.auth.getUser(token);
    if (userError || !userData?.user) return json({ error: "Nicht angemeldet." }, 401);
    const userId = userData.user.id;

    const { data: allowed } = await service.rpc("is_admin_or_office", { _user_id: userId });
    if (!allowed) return json({ error: "Keine Berechtigung für Rechnungen." }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action ?? "issue";

    if (action === "preview") {
      if (!body.ticketId) return json({ error: "ticketId fehlt" }, 400);
      const result = await previewRouting(service, {
        ticketId: String(body.ticketId),
        customerId: body.customerId ?? null,
        billingPartnerId: body.billingPartnerId ?? null,
        currency: body.currency ?? "CHF",
        overrideProfileId: body.overrideProfileId ?? null,
        overrideReason: body.overrideReason ?? null,
      });
      return json(result, result.ok ? 200 : 200);
    }

    if (!body.ticketId) return json({ error: "ticketId fehlt" }, 400);
    if (typeof body.total !== "number") return json({ error: "total fehlt" }, 400);

    const result = await issueInvoice(service, {
      ticketId: String(body.ticketId),
      customerId: body.customerId ?? null,
      billingPartnerId: body.billingPartnerId ?? null,
      subtotal: Number(body.subtotal ?? body.total),
      discount: Number(body.discount ?? 0),
      total: Number(body.total),
      currency: body.currency ?? "CHF",
      dueDays: body.dueDays ?? 14,
      overrideProfileId: body.overrideProfileId ?? null,
      overrideReason: body.overrideReason ?? null,
      actorUserId: userId,
      allowAdditional: !!body.allowAdditional,
    });

    return json(result, result.ok ? 200 : 400);
  } catch (error) {
    console.error("issue-invoice error", error);
    return json({ error: (error as Error).message }, 500);
  }
});
