import { supabase } from '@/integrations/supabase/client';

export interface ProductLifecycleResult {
  ok?: boolean;
  error?: string;
  dependencies?: Record<string, number>;
  product?: Record<string, unknown>;
  log_id?: string;
}
export class ProductLifecycleError extends Error {
  constructor(public result: ProductLifecycleResult) {
    super(result.error === 'conflict' ? 'Das Produkt wurde inzwischen geändert. Bitte neu öffnen.'
      : result.error === 'referenced' ? 'Dieses Produkt wird bereits verwendet und kann nur deaktiviert werden.'
      : result.error === 'not_installed' ? 'Die sichere Produktverwaltung ist noch nicht freigegeben.'
      : 'Die sichere Produktprüfung ist fehlgeschlagen. Es wurde nichts gelöscht.');
  }
}
export function productSnapshot(product: object): Record<string, unknown> {
  const { price_tiers: _tiers, ...row } = product as Record<string, unknown>;
  return row;
}
export async function productLifecycle(body: Record<string, unknown>): Promise<ProductLifecycleResult> {
  const { data, error } = await supabase.functions.invoke('product-management', { body });
  let result = data as ProductLifecycleResult | null;
  if (error && !result && error.context instanceof Response) {
    try { result = await error.context.json(); } catch { /* fail closed */ }
  }
  if (error || result?.error || !result) throw new ProductLifecycleError(result ?? { error: 'unavailable' });
  return result;
}