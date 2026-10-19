import assert from "node:assert/strict";
import { test } from "node:test";
import { publicPortraitUrl } from "../supabase/functions/_shared/publicPortraitUrl.ts";
import { placeholderPortraitUrl } from "../supabase/functions/_shared/placeholderPortrait.ts";
import { homepageBlocker } from "../src/hooks/homepageBlocker.ts";

test("missing photo yields null placeholder, not a hidden profile", () => {
  assert.equal(publicPortraitUrl(null), null);
  assert.equal(publicPortraitUrl("  "), null);
});
test("placeholder portraits map by gender, male as default", () => {
  const female = placeholderPortraitUrl("f");
  const male = placeholderPortraitUrl("m");
  assert.match(female, /instructor-placeholder-female\.jpg$/);
  assert.match(male, /instructor-placeholder-male\.jpg$/);
  assert.equal(placeholderPortraitUrl("female"), female);
  assert.equal(placeholderPortraitUrl("weiblich"), female);
  assert.equal(placeholderPortraitUrl(null), male);
  assert.equal(placeholderPortraitUrl("x"), male);
});
test("placeholder URLs are absolute public site URLs", () => {
  assert.match(placeholderPortraitUrl("f"), /^https:\/\//);
  assert.doesNotMatch(placeholderPortraitUrl("f"), /instructor-hr-photos|\/object\/sign\//);
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
