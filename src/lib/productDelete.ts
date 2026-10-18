import { supabase } from '@/integrations/supabase/client';

export interface ProductDeleteResult { ok?: boolean; error?: string; dependencies?: Record<string, number> }

export class ProductDeleteError extends Error {
  constructor(public result: ProductDeleteResult) {
    super(result.error === 'referenced' ? 'Dieses Produkt wird verwendet und kann nur deaktiviert werden.'
      : result.error === 'not_installed' ? 'Das sichere Löschen ist noch nicht freigegeben.'
      : result.error === 'forbidden' ? 'Keine Berechtigung zum Löschen.'
      : 'Löschen fehlgeschlagen. Es wurde nichts gelöscht.');
  }
}

/** Deletes a product only via the staff server check; never falls back to a direct browser delete. */
export async function deleteProductGuarded(productId: string): Promise<ProductDeleteResult> {
  const { data, error } = await supabase.functions.invoke('product-management', { body: { action: 'delete', product_id: productId } });
  let result = data as ProductDeleteResult | null;
  if (error && !result && error.context instanceof Response) {
    try { result = await error.context.json(); } catch { /* fail closed */ }
  }
  if (error || !result || result.error || !result.ok) throw new ProductDeleteError(result ?? { error: 'unavailable' });
  return result;
}
