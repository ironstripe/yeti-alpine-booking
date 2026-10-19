import assert from "node:assert/strict";
import { test } from "node:test";
import { publicPortraitUrl } from "../supabase/functions/_shared/publicPortraitUrl.ts";
import { homepageBlocker } from "../src/hooks/homepageBlocker.ts";

test("missing photo yields null placeholder, not a hidden profile", () => {
  assert.equal(publicPortraitUrl(null), null);
  assert.equal(publicPortraitUrl("  "), null);
});
test("private HR photos and signed URLs never become public", () => {
  assert.equal(publicPortraitUrl("https://x/storage/v1/object/public/instructor-hr-photos/a.jpg"), null);
  assert.equal(publicPortraitUrl("https://x/storage/v1/object/sign/instructor-avatars/a.jpg?token=1"), null);
});
test("public avatar URL passes through", () => {
  const u = "https://x/storage/v1/object/public/instructor-avatars/a/website-1.jpg";
  assert.equal(publicPortraitUrl(u), u);
});
test("homepage switch: inactive or no teaser blocks turning on; turning off always allowed", () => {
  assert.notEqual(homepageBlocker({ status: "inactive", website_teaser: "Hi", show_on_website: false }), null);
  assert.notEqual(homepageBlocker({ status: "active", website_teaser: " ", show_on_website: false }), null);
  assert.equal(homepageBlocker({ status: "active", website_teaser: "Hi", show_on_website: false }), null);
  assert.equal(homepageBlocker({ status: "inactive", website_teaser: null, show_on_website: true }), null);
});
