import assert from 'node:assert/strict';
import fs from 'node:fs';

// Contract guard for the Core -> Onepager product-only catalog.
const src = fs.readFileSync(new URL('../supabase/functions/get-website-products/index.ts', import.meta.url), 'utf8');

// Products only: never query or expose internal scheduling data.
assert.doesNotMatch(src, /group_courses/, 'must not query group_courses');
assert.doesNotMatch(src, /group_course_instances/, 'must not query group_course_instances');
assert.doesNotMatch(src, /instructors/, 'must not query instructors');

// Keyed by stable products.id.
assert.match(src, /id: p\.id/, 'payload keyed by products.id');

// No raw products.description (BC import notes) in select or payload.
assert.doesNotMatch(src, /description/, 'products.description must not be selected or published');

// Availability policy present, informational only.
assert.match(src, /availability_policy: p\.type === "private" \? "private_check" : "group_season"/);

// Safety gates preserved: no online sales, season-scoped, website-visible only.
assert.match(src, /online_bookable:\s*false/);
assert.match(src, /\.eq\("season_id", season\.id\)\.eq\("show_on_website", true\)/);

// Exact positive cumulative tiers preserved, no price mutation.
assert.match(src, /cumulative_price: Number\(t\.cumulative_price\)/);
assert.doesNotMatch(src, /price\s*[*/+-]=/, 'no price arithmetic');

console.log('PASS website catalog contract: products-only, stable ids, no description, availability_policy, gates intact');
