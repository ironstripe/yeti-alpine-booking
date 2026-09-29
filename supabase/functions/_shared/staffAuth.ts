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

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Requires the server-only YETI_TEST_SECRET in the `x-test-secret` header.
 * Rejects if the secret is unset, too short, or equal to the intake key or
 * the public app key (those are not acceptable as a test secret).
 */
export function requireTestSecret(req: Request, cors: Record<string, string> = baseCors): Response | null {
  const secret = Deno.env.get("YETI_TEST_SECRET") ?? "";
  const forbidden = [
    Deno.env.get("YETI_INTAKE_API_KEY"),
    Deno.env.get("SUPABASE_ANON_KEY"),
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY"),
  ].filter((v): v is string => !!v);
  if (secret.length < 32 || forbidden.includes(secret)) {
    return deny("Test secret not configured", 403, cors);
  }
  const provided = req.headers.get("x-test-secret") ?? "";
  if (!provided || !safeEqual(provided, secret)) return deny("Unauthorized", 401, cors);
  return null;
}
