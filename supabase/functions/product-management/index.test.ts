import { assertEquals, assert } from 'jsr:@std/assert@1';
Deno.test({ name: 'product delete API: staff-only, actor derived from session, referenced kept', sanitizeOps: false, sanitizeResources: false, fn: async () => {
  const fetchOriginal = globalThis.fetch, serveOriginal = Deno.serve;
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], previous = keys.map((k) => Deno.env.get(k));
  const actor = '00000000-0000-4000-8000-000000000001', product = '00000000-0000-4000-8000-000000000003';
  let handler: ((r: Request) => Promise<Response>) | undefined, role = 'office', rpc = 0;
  let result: Record<string, unknown> = { ok: true };
  try {
    Deno.env.set(keys[0], 'http://localhost:54321'); Deno.env.set(keys[1], 'synthetic');
    Deno.serve = ((f: unknown) => { handler = f as typeof handler; return {} as Deno.HttpServer; }) as typeof Deno.serve;
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      const u = new URL(input instanceof Request ? input.url : String(input));
      assertEquals(u.origin, 'http://localhost:54321');
      let data: unknown;
      if (u.pathname === '/auth/v1/user') data = { id: actor };
      else if (u.pathname === '/rest/v1/user_roles') data = role === 'teacher' ? [] : [{ role }];
      else if (u.pathname === '/rest/v1/rpc/product_delete') {
        rpc++;
        const raw = input instanceof Request ? await input.text() : String(init?.body);
        assertEquals(JSON.parse(raw), { p_product: product, p_actor: actor });
        data = result;
      } else throw Error('Unexpected endpoint ' + u.pathname);
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
    };
    await import('./index.ts'); assert(handler);
    const body = { action: 'delete', product_id: product };
    const req = (b: unknown = body, auth = true) => new Request('http://localhost/', { method: 'POST', headers: { ...(auth ? { Authorization: 'Bearer synthetic' } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
    assertEquals((await handler(req(body, false))).status, 401); assertEquals(rpc, 0);
    role = 'teacher'; assertEquals((await handler(req())).status, 403); assertEquals(rpc, 0);
    for (const staff of ['office', 'admin', 'super_admin']) { role = staff; assertEquals((await handler(req())).status, 200); }
    assertEquals(rpc, 3);
    assertEquals((await handler(req({ ...body, actor }))).status, 400); assertEquals(rpc, 3);
    result = { error: 'referenced', dependencies: { group_courses: 1 } };
    const r = await handler(req()); assertEquals(r.status, 409); assertEquals((await r.json()).dependencies, { group_courses: 1 });
  } finally {
    globalThis.fetch = fetchOriginal; Deno.serve = serveOriginal;
    keys.forEach((k, i) => previous[i] === undefined ? Deno.env.delete(k) : Deno.env.set(k, previous[i] ?? ''));
  }
} });
