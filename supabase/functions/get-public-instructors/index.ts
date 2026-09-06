// Public endpoint: published instructor profiles for the public website.
// Only returns explicitly published, consented, minimal profile data.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, checkApiKey, json } from "../_shared/intakeAuth.ts";

const PORTRAIT_BUCKET = "website-instructor-portraits";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7; // 7 days

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
      .from("instructor_public_profiles")
      .select(
        "public_display_name, public_role_label, teaser_published, portrait_url, portrait_storage_path, sort_order, instructors!inner(status, avatar_url)",
      )
      .eq("status", "published")
      .eq("instructors.status", "active")
      .order("sort_order", { ascending: true })
      .order("public_display_name", { ascending: true });

    if (error) throw new Error(error.message);

    // Fall back to the instructor's regular profile picture (public bucket)
    // when no dedicated website portrait was uploaded. Strip cache-busters.
    const avatarFallback = (r: any): string | null => {
      const url: string | null = r.instructors?.avatar_url ?? null;
      if (!url) return null;
      return url.split("?")[0];
    };

    const rows = (data ?? []).filter((r: any) =>
      r.public_display_name && r.public_role_label && r.teaser_published &&
      (r.portrait_url || r.portrait_storage_path || avatarFallback(r))
    );

    const team = [] as Array<Record<string, string>>;
    for (const r of rows as any[]) {
      let portraitUrl: string | null = r.portrait_url ?? null;
      if (r.portrait_storage_path) {
        const { data: signed } = await supabase.storage
          .from(PORTRAIT_BUCKET)
          .createSignedUrl(r.portrait_storage_path, SIGNED_URL_TTL);
        if (signed?.signedUrl) portraitUrl = signed.signedUrl;
      }
      if (!portraitUrl) portraitUrl = avatarFallback(r);
      if (!portraitUrl) continue;
      team.push({
        display_name: r.public_display_name,
        role_label: r.public_role_label,
        teaser: r.teaser_published,
        portrait_url: portraitUrl,
      });
    }

    console.log(`get-public-instructors: returned ${team.length} published profiles`);
    return json({ success: true, team });
  } catch (e) {
    console.error("get-public-instructors error:", (e as Error).message);
    return json({ error: "Internal error" }, 500);
  }
});
