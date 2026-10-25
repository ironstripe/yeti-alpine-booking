// Public endpoint: instructor cards for the public website.
// Returns only minimal, explicitly enabled public data.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, checkApiKey, json } from "../_shared/intakeAuth.ts";
import { publicInstructorTitle } from "../_shared/publicInstructorTitle.ts";
import { publicPortraitUrl } from "../_shared/publicPortraitUrl.ts";
import { placeholderPortraitUrl } from "../_shared/placeholderPortrait.ts";
import { publicExpertiseByInstructor, publicLanguages } from "../_shared/publicInstructorDetails.ts";

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
      .select("id, languages, first_name, last_name, specialization, roles, gender, website_role_title, avatar_url, website_teaser")
      .eq("status", "active")
      .eq("show_on_website", true)
      .order("first_name", { ascending: true })
      .order("last_name", { ascending: true });

    if (error) throw new Error(error.message);

    // One batched canonical capability join for eligible instructors (no N+1).
    const eligibleIds = (data ?? [])
      .filter((r) => (r.website_teaser ?? "").trim() && `${r.first_name ?? ""}${r.last_name ?? ""}`.trim())
      .map((r) => r.id);
    let expertise = new Map<string, { category: string; name: string }[]>();
    if (eligibleIds.length) {
      const { data: caps, error: capErr } = await supabase
        .from("instructor_capabilities")
        .select("instructor_id, capabilities!instructor_capabilities_capability_id_fkey(name, category)")
        .in("instructor_id", eligibleIds);
      if (capErr) throw new Error(capErr.message);
      expertise = publicExpertiseByInstructor((caps ?? []) as never);
    }

    const team = (data ?? [])
      .map((r) => {
        const displayName = `${(r.first_name ?? "").trim()} ${(r.last_name ?? "").trim()}`.trim();
        if (!displayName) return null;
        const teaser = (r.website_teaser ?? "").trim();
        if (!teaser) return null;
        const portraitUrl = publicPortraitUrl(r.avatar_url) ?? placeholderPortraitUrl(r.gender);
        return {
          display_name: displayName,
          role_label: publicInstructorTitle({
            specialization: r.specialization ?? null,
            roles: r.roles ?? null,
            gender: r.gender ?? null,
            website_role_title: r.website_role_title ?? null,
          }),
          teaser,
          // Real photo when available; otherwise the gender-matched illustration
          // hosted by Core, so the Onepager needs no placeholder of its own.
          portrait_url: portraitUrl,
          languages: publicLanguages(r.languages),
          expertise: expertise.get(r.id) ?? [],
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
