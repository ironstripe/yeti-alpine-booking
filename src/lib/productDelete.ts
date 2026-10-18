import { supabase } from '@/integrations/supabase/client';

export interface ProductDeleteResult { ok?: boolean; error?: string; dependencies?: Record<string, number> }

export class ProductDeleteError extends Error {
  constructor(public result: ProductDeleteResult) {
    super(result.error === 'referenced' ? 'Dieses Produkt wird verwendet und kann nur deaktiviert werden.'
      : result.error === 'not_installed' || result.error === 'invalid' ? 'Das sichere Löschen ist noch nicht freigegeben. Es wurde nichts gelöscht.'
      : result.error === 'forbidden' ? 'Keine Berechtigung zum Löschen.'
      : 'Löschen fehlgeschlagen. Es wurde nichts gelöscht.');
  }
}

/** Deletes a product only via the staff server check; never falls back to a direct browser delete. */
export async function deleteProductGuarded(productId: string): Promise<ProductDeleteResult> {
  const { data, error } = await supabase.functions.invoke('product-management', { body: { action: 'delete', product_id: productId } });
  let result = data as ProductDeleteResult | null;
  if (error && !result) {
    // The error body carries the dependency details (409 "referenced"); read it however the relay exposes it.
    const ctx = (error as { context?: unknown }).context;
    try {
      if (ctx instanceof Response) result = await ctx.json();
      else if (ctx && typeof (ctx as { json?: unknown }).json === 'function') result = await (ctx as { json: () => Promise<ProductDeleteResult> }).json();
      else if (typeof ctx === 'string') result = JSON.parse(ctx);
    } catch { /* fail closed */ }
    if (!result && typeof error.message === 'string') {
      // Some relays embed the JSON body in the message text ("... 409: Error, {...}").
      const match = error.message.match(/\{.*\}/s);
      if (match) { try { result = JSON.parse(match[0]); } catch { /* fail closed */ } }
    }
  }
  if (error || !result || result.error || !result.ok) throw new ProductDeleteError(result ?? { error: 'unavailable' });
  return result;
}
