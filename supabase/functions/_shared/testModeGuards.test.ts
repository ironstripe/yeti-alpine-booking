// Negative tests for the ENABLED test-mode case: with ALLOW_TEST_FUNCTIONS=true
// a public caller must still be rejected by the second guard (admin session or
// server-only test secret), and each test endpoint must run both guards first.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { requireRole, requireTestSecret, testFunctionsDisabled } from "./staffAuth.ts";

const GOOD = "s".repeat(40);
const req = (h: Record<string, string> = {}) => new Request("http://t", { method: "POST", headers: h });
function env(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v);
}
// Deterministic starting point for every test in this file.
function reset() {
  env({
    ALLOW_TEST_FUNCTIONS: "true",
    YETI_TEST_SECRET: undefined,
    YETI_INTAKE_API_KEY: undefined,
    SUPABASE_ANON_KEY: undefined,
    SUPABASE_PUBLISHABLE_KEY: undefined,
  });
}
// requireRole must not authorize: either it denies (401/403) or it fails closed.
async function notAuthorized(headers: Record<string, string> = {}) {
  try {
    const res = (await requireRole(req(headers), ["admin"])) as Response;
    assert(res instanceof Response && (res.status === 401 || res.status === 403), `expected denial, got ${JSON.stringify(res)}`);
  } catch {
    // network/env failure while verifying the token = no access granted
  }
}

Deno.test("test mode ON: switch alone never authorizes", () => {
  reset();
  assertEquals(testFunctionsDisabled(), null); // switch passes...
});

Deno.test("test mode ON: anonymous caller -> 401 from requireRole", async () => {
  reset();
  assertEquals(((await requireRole(req(), ["admin"])) as Response).status, 401);
  assertEquals(((await requireRole(req({ Authorization: "" }), ["admin"])) as Response).status, 401);
  assertEquals(((await requireRole(req({ Authorization: "Bearer" }), ["admin"])) as Response).status, 401);
  await notAuthorized({ Authorization: "Basic abc" });
});

Deno.test("test mode ON: public app key is not a valid session", async () => {
  reset();
  env({ SUPABASE_ANON_KEY: GOOD });
  await notAuthorized({ Authorization: `Bearer ${GOOD}` });
});

Deno.test("test mode ON: missing test secret header -> 401", () => {
  reset();
  env({ YETI_TEST_SECRET: GOOD });
  assertEquals(requireTestSecret(req())?.status, 401);
  assertEquals(requireTestSecret(req({ "x-test-secret": "" }))?.status, 401);
  assertEquals(requireTestSecret(req({ "x-test-secret": "wrong" }))?.status, 401);
});

Deno.test("test mode ON: intake key / public key rejected as test secret", () => {
  reset();
  env({ YETI_TEST_SECRET: GOOD, YETI_INTAKE_API_KEY: GOOD });
  assertEquals(requireTestSecret(req({ "x-test-secret": GOOD }))?.status, 403);
  env({ YETI_INTAKE_API_KEY: undefined, SUPABASE_ANON_KEY: GOOD });
  assertEquals(requireTestSecret(req({ "x-test-secret": GOOD }))?.status, 403);
  env({ SUPABASE_ANON_KEY: undefined });
});

Deno.test("test mode ON: unset or too-short test secret -> 403", () => {
  reset();
  assertEquals(requireTestSecret(req({ "x-test-secret": "anything" }))?.status, 403);
  env({ YETI_TEST_SECRET: "short" });
  assertEquals(requireTestSecret(req({ "x-test-secret": "short" }))?.status, 403);
  env({ YETI_TEST_SECRET: undefined });
});

// Static guard-order checks: both guards must appear before any request body
// handling / service-role work in each test endpoint.
const endpoints: Array<[string, string]> = [
  ["generate-test-bookings", "requireRole"],
  ["test-instructor-login", "requireRole"],
  ["test-intake-contract", "requireTestSecret"],
];

for (const [fn, secondGuard] of endpoints) {
  Deno.test(`${fn}: runs testFunctionsDisabled + ${secondGuard} before any work`, async () => {
    const src = await Deno.readTextFile(new URL(`../${fn}/index.ts`, import.meta.url));
    const serve = src.indexOf("Deno.serve");
    const switchIdx = src.indexOf("testFunctionsDisabled(", serve);
    const guardIdx = src.indexOf(`${secondGuard}(`, serve);
    const work = src.indexOf("req.json()", serve);
    assert(switchIdx > serve, `${fn}: missing testFunctionsDisabled guard`);
    assert(guardIdx > switchIdx, `${fn}: missing ${secondGuard} after the test-mode switch`);
    if (work > -1) assert(work > guardIdx, `${fn}: reads the request body before authorization`);
  });
}
