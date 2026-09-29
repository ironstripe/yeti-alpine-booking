// Shared authorization helpers for internal/staff edge functions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const baseCors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function deny(message: string, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/**
 * Validates the caller's JWT and requires one of the given roles.
 * Returns { userId } on success, or a Response to return immediately.
 */
export async function requireRole(
  req: Request,
  allowed: Array<"admin" | "office" | "teacher">,
  cors: Record<string, string> = baseCors,
): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return deny("Unauthorized", 401, cors);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData?.user) return deny("Unauthorized", 401, cors);

  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id)
    .in("role", allowed);
  if (!roles || roles.length === 0) return deny("Forbidden", 403, cors);

  return { userId: userData.user.id };
}

/**
 * Test/debug endpoints are disabled unless ALLOW_TEST_FUNCTIONS === "true"
 * is explicitly set for the environment (never set it in production).
 */
export function testFunctionsDisabled(cors: Record<string, string> = baseCors): Response | null {
  if (Deno.env.get("ALLOW_TEST_FUNCTIONS") === "true") return null;
  return deny("This test endpoint is disabled in this environment", 403, cors);
}
