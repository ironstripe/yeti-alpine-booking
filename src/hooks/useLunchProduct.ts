// Authoritative lunch-supervision price: exactly one active products.type='lunch' row — the same
// rule the staff group booking server applies. No season filter, no fallback price.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface LunchProductInfo { id: string; price: number }

export async function fetchLunchProduct(): Promise<LunchProductInfo | null> {
  const { data, error } = await supabase.from("products").select("id, price").eq("type", "lunch").eq("is_active", true);
  if (error) throw error;
  if (!data || data.length !== 1 || !(Number(data[0].price) > 0)) return null;
  return { id: data[0].id, price: Number(data[0].price) };
}

export function useLunchProduct() {
  return useQuery({ queryKey: ["lunch-product", "active-unique"], queryFn: fetchLunchProduct, staleTime: 60_000 });
}
