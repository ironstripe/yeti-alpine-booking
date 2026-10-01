import { assert, assertEquals } from "jsr:@std/assert@1";
const up = await Deno.readTextFile(new URL("../instructor-photo-upload/index.ts", import.meta.url));
const url = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const pub = await Deno.readTextFile(new URL("../get-public-instructors/index.ts", import.meta.url));
const release = await Deno.readTextFile(new URL("../instructor-website-publish/index.ts", import.meta.url));
Deno.test("manual upload never writes public bucket or avatar_url", () => {
  assert(!up.includes('from("instructor-avatars")'));
  assert(!/avatar_url\s*:/.test(up.replace(/\/\/.*$/gm, "")));
  assert(up.includes("bc_register_manual_photo"));
  assert(up.includes('requireRole(req, ["admin", "office", "super_admin"]'));
});
Deno.test("signed URL endpoint is staff-only, short-lived, never persisted", () => {
  assert(url.includes('requireRole(req, ["admin", "office", "super_admin"]'));
  assertEquals(/TTL = 300/.test(url), true);
  assert(!/\.update\(/.test(url));
});
Deno.test("public team export gated on active + show_on_website, never private bucket", () => {
  assert(pub.includes('.eq("status", "active")') && pub.includes('.eq("show_on_website", true)'));
  assert(!pub.includes('.from("instructor-hr-photos")') && !pub.includes('.from("instructor_photos")'));
  assert(pub.includes('!teaser || !portraitUrl') && pub.includes('portraitUrl.includes("/object/sign/")'));
});
Deno.test("one-profile website release requires staff, an explicit current photo and a public-only update", () => {
  assert(release.includes('requireRole(req, ["admin", "office", "super_admin"]'));
  assert(release.includes('source_photo_id') && release.includes('.eq("is_current", true)'));
  assert(release.includes('makeRendition(') && release.includes('.from("instructor-avatars")'));
  assert(release.includes('show_on_website: true') && release.includes('website_teaser: teaser'));
  assert(!release.includes('hourly_rate') && !release.includes('ahv_number'));
});
