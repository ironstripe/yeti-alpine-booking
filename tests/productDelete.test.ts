import { test, expect, mock } from 'bun:test';
let response: { data: unknown; error: unknown } = { data: { ok: true }, error: null };
const calls: Record<string, unknown>[] = [];
mock.module('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: async (name: string, { body }: { body: Record<string, unknown> }) => { expect(name).toBe('product-management'); calls.push(body); return response; } } } }));
const { deleteProductGuarded, ProductDeleteError } = await import('../src/lib/productDelete');

test('referenced conflict keeps dependencies for the deactivate choice', async () => {
  response = { data: null, error: { context: new Response(JSON.stringify({ error: 'referenced', dependencies: { group_courses: 2 } }), { status: 409 }) } };
  try { await deleteProductGuarded('fixture'); throw Error('must reject'); }
  catch (e) { expect(e).toBeInstanceOf(ProductDeleteError); expect((e as InstanceType<typeof ProductDeleteError>).result.dependencies).toEqual({ group_courses: 2 }); }
  expect(calls.at(-1)).toEqual({ action: 'delete', product_id: 'fixture' });
});
test('server failure rejects without fallback delete', async () => {
  response = { data: null, error: { context: new Response('x', { status: 503 }) } };
  await expect(deleteProductGuarded('fixture')).rejects.toThrow('nichts gelöscht');
});
