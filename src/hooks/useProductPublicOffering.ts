import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizeScheduleText, type ProductOffering } from '@/lib/productPublicOffering';
// Install the incremental series migration before releasing this projection.
export function useProductPublicOffering(productId?: string) {
  return useQuery({ queryKey:['product-public-offering',productId], enabled:!!productId, retry:false,
    queryFn:async ():Promise<ProductOffering|null> => {
      if(!productId) return null;
      const {data,error}=await (supabase as any).from('product_public_offerings').select('schedule_kind,weekdays,dates,time_blocks,display_schedule_text,series').eq('product_id',productId).maybeSingle();
      if(error) throw error;
      return data;
    },
  });
}
export function useSaveProductPublicOffering() {
  const cache=useQueryClient();
  return useMutation({mutationFn:async ({productId,offering}:{productId:string;offering:ProductOffering|null}) => {
    const normalized = offering ? {...offering,display_schedule_text:normalizeScheduleText(offering.display_schedule_text)} : null;
    const {data,error}=await supabase.functions.invoke('product-public-offering',{body:{product_id:productId,offering:normalized}});
    if(error || data?.error) throw new Error(data?.error || error?.message || 'Website-Informationen nicht gespeichert');
    const saved=data.offering as ProductOffering|null;
    cache.setQueryData(['product-public-offering',productId],saved);
    return saved;
  }});
}
