import { assert } from "jsr:@std/assert@1";

const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("link-instructor-to-user authorizes an admin before privileged work", () => {
  const serve = source.indexOf("Deno.serve");
  const guard = source.indexOf('const authorization = await requireRole(req, ["admin"], corsHeaders);', serve);
  const earlyReturn = source.indexOf("if (authorization instanceof Response) return authorization;", guard);
  const bodyRead = source.indexOf("const { email, roles } = await req.json();", serve);
  const adminClient = source.indexOf("SUPABASE_SERVICE_ROLE_KEY", serve);

  assert(serve >= 0, "handler must exist");
  assert(guard > serve, "admin authorization must be in the request handler");
  assert(earlyReturn > guard, "authorization failure must return immediately");
  assert(bodyRead > earlyReturn, "request body must not be read before authorization");
  assert(adminClient > earlyReturn, "service-role access must not begin before authorization");
});
