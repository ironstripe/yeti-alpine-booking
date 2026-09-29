import { assertEquals } from "jsr:@std/assert@1";
import { requireRole, requireTestSecret, testFunctionsDisabled } from "./staffAuth.ts";

const GOOD = "x".repeat(40);
const req = (h: Record<string, string> = {}) => new Request("http://t", { method: "POST", headers: h });
function env(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v);
}

Deno.test("test mode off -> 403", () => {
  env({ ALLOW_TEST_FUNCTIONS: undefined });
  assertEquals(testFunctionsDisabled()?.status, 403);
  env({ ALLOW_TEST_FUNCTIONS: "1" });
  assertEquals(testFunctionsDisabled()?.status, 403);
});
Deno.test("test mode on -> passes switch only", () => {
  env({ ALLOW_TEST_FUNCTIONS: "true" });
  assertEquals(testFunctionsDisabled(), null);
});
Deno.test("test secret unset -> 403", () => {
  env({ YETI_TEST_SECRET: undefined });
  assertEquals(requireTestSecret(req({ "x-test-secret": "" }))?.status, 403);
});
Deno.test("test secret equal to intake key -> 403", () => {
  env({ YETI_TEST_SECRET: GOOD, YETI_INTAKE_API_KEY: GOOD });
  assertEquals(requireTestSecret(req({ "x-test-secret": GOOD }))?.status, 403);
  env({ YETI_INTAKE_API_KEY: undefined });
});
Deno.test("test secret equal to public app key -> 403", () => {
  env({ YETI_TEST_SECRET: GOOD, SUPABASE_ANON_KEY: GOOD });
  assertEquals(requireTestSecret(req({ "x-test-secret": GOOD }))?.status, 403);
  env({ SUPABASE_ANON_KEY: undefined });
});
Deno.test("missing / wrong / intake-key header -> 401", () => {
  env({ YETI_TEST_SECRET: GOOD, YETI_INTAKE_API_KEY: "intake-key" });
  assertEquals(requireTestSecret(req())?.status, 401);
  assertEquals(requireTestSecret(req({ "x-test-secret": "y".repeat(40) }))?.status, 401);
  assertEquals(requireTestSecret(req({ "x-test-secret": "intake-key", "x-api-key": "intake-key" }))?.status, 401);
});
Deno.test("correct secret -> allowed", () => {
  env({ YETI_TEST_SECRET: GOOD });
  assertEquals(requireTestSecret(req({ "x-test-secret": GOOD })), null);
});
Deno.test("requireRole: no / malformed auth header -> 401 without network", async () => {
  assertEquals(((await requireRole(req(), ["admin"])) as Response).status, 401);
  assertEquals(((await requireRole(req({ Authorization: "Bearer " }), ["admin"])) as Response).status, 401);
});
