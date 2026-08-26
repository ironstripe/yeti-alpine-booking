// Shared helpers for public website-facing intake endpoints.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function checkApiKey(req: Request): Response | null {
  const expectedKey = Deno.env.get("YETI_INTAKE_API_KEY");
  const providedKey = req.headers.get("x-api-key");
  if (!expectedKey || providedKey !== expectedKey) {
    return json({ error: "Unauthorized" }, 401);
  }
  return null;
}

export function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
