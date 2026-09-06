// Public endpoint: instructor cards for the public website.
// Returns only minimal, explicitly enabled public data.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, checkApiKey, json } from "../_shared/intakeAuth.ts";

function roleLabel(specialization: string | null, roles: string[] | null): string {
  const hay = [specialization ?? "", ...(roles ?? [])].join(" ").toLowerCase();
  const ski = hay.includes("ski");
  const snowboard = hay.includes("snowboard") || hay.includes("board");
  if (ski && snowboard) return "Ski- und Snowboardlehrperson";
  if (snowboard) return "Snowboardlehrperson";
  if (ski) return "Skilehrperson";
  return "Schneesportlehrperson";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const authErr = checkApiKey(req);
  if (authErr) return authErr;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data, error } = await supabase
      .from("instructors")
      .select("first_name, last_name, specialization, roles, avatar_url, website_teaser")
      .eq("status", "active")
      .eq("show_on_website", true)
      .order("first_name", { ascending: true })
      .order("last_name", { ascending: true });

    if (error) throw new Error(error.message);

    const team = (data ?? [])
      .map((r: any) => {
        const displayName = `${(r.first_name ?? "").trim()} ${(r.last_name ?? "").trim()}`.trim();
        if (!displayName) return null;
        const teaser = (r.website_teaser ?? "").trim();
        const portraitUrl = (r.avatar_url ?? "").trim();
        return {
          display_name: displayName,
          role_label: roleLabel(r.specialization ?? null, r.roles ?? null),
          ...(teaser ? { teaser } : {}),
          ...(portraitUrl ? { portrait_url: portraitUrl } : {}),
        };
      })
      .filter(Boolean);

    console.log(`get-public-instructors: returned ${team.length} profiles`);
    return json({ success: true, team });
  } catch (e) {
    console.error("get-public-instructors error:", (e as Error).message);
    return json({ error: "Internal error" }, 500);
  }
});
