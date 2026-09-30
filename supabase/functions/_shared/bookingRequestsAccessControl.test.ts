import { assert } from "jsr:@std/assert@1";

const migration = await Deno.readTextFile(
  new URL(`../../migrations/${Deno.args[0] ?? ""}`, import.meta.url),
).catch(() => "");

Deno.test("booking_requests access-control migration blocks legacy direct access", () => {
  assert(migration.length > 0, "pass the P0.2 booking_requests migration filename to this test");
  assert(migration.includes("ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY"));
  assert(migration.includes('DROP POLICY IF EXISTS "Anyone can create booking requests"'));
  assert(migration.includes('DROP POLICY IF EXISTS "Anyone can view requests by magic token"'));
  assert(migration.includes('DROP POLICY IF EXISTS "Authenticated users can update booking requests"'));
  assert(migration.includes("REVOKE ALL ON TABLE public.booking_requests FROM anon"));
  assert(migration.includes('CREATE POLICY "Admin and office can manage booking requests"'));
  assert(migration.includes("public.is_admin_or_office(auth.uid())"));
});
