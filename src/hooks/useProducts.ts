import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { PriceTier } from "@/lib/pricing-utils";

export type Product = Tables<"products">;
export type ProductInsert = TablesInsert<"products">;
export type ProductUpdate = TablesUpdate<"products">;

export interface ProductWithTiers extends Product {
  price_tiers?: PriceTier[];
}

interface UseProductsOptions {
  isTrainingProduct?: boolean;
  isActive?: boolean;
  includeTiers?: boolean;
  seasonId?: string;
}

export function useProducts(options?: UseProductsOptions) {
  return useQuery({
    queryKey: ["products", options],
    queryFn: async () => {
      const includeTiers = options?.includeTiers ?? true;
      
      // First fetch products
      let query = supabase
        .from("products")
        .select("*")
        .order("sort_order", { ascending: true });

      if (options?.isTrainingProduct !== undefined) {
        query = query.eq("is_training_product", options.isTrainingProduct);
      }
      if (options?.isActive !== undefined) {
        query = query.eq("is_active", options.isActive);
      }

      const { data: products, error } = await query;
      if (error) throw error;

      if (!includeTiers || !products?.length) {
        return products as ProductWithTiers[];
      }

      // Fetch price tiers for all products
      const productIds = products.map(p => p.id);
      const { data: tiers, error: tiersError } = await supabase
        .from("product_price_tiers")
        .select("product_id, day_count, cumulative_price")
        .in("product_id", productIds);

      if (tiersError) throw tiersError;

      // Merge tiers into products
      const productsWithTiers = products.map(product => ({
        ...product,
        price_tiers: (tiers || [])
          .filter(t => t.product_id === product.id)
          .map(t => ({ day_count: t.day_count, cumulative_price: Number(t.cumulative_price) })),
      }));

      return productsWithTiers as ProductWithTiers[];
    },
  });
}

// Helper hook for training products only
export function useTrainingProducts() {
  return useProducts({ isTrainingProduct: true, isActive: true });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: ["products", id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data: product, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;

      // Fetch price tiers separately
      const { data: tiers, error: tiersError } = await supabase
        .from("product_price_tiers")
        .select("day_count, cumulative_price")
        .eq("product_id", id);

      if (tiersError) throw tiersError;

      return {
        ...product,
        price_tiers: (tiers || []).map(t => ({ 
          day_count: t.day_count, 
          cumulative_price: Number(t.cumulative_price) 
        })),
      } as ProductWithTiers;
    },
    enabled: !!id,
  });
}

interface CreateProductPayload extends ProductInsert {
  price_tiers?: PriceTier[];
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ price_tiers, ...product }: CreateProductPayload) => {
      // Create the product first
      const { data: createdProduct, error: productError } = await supabase
        .from("products")
        .insert(product)
        .select()
        .single();

      if (productError) throw productError;

      // If tiered pricing, insert the tiers
      if (product.pricing_type === "tiered" && price_tiers?.length) {
        const tiersToInsert = price_tiers
          .filter((t) => t.cumulative_price > 0)
          .map((t) => ({
            product_id: createdProduct.id,
            day_count: t.day_count,
            cumulative_price: t.cumulative_price,
          }));

        if (tiersToInsert.length > 0) {
          const { error: tiersError } = await supabase
            .from("product_price_tiers")
            .insert(tiersToInsert);

          if (tiersError) throw tiersError;
        }
      }

      return createdProduct;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produkt erstellt");
    },
    onError: (error) => {
      console.error("Error creating product:", error);
      toast.error("Fehler beim Erstellen");
    },
  });
}

interface UpdateProductPayload extends ProductUpdate {
  id: string;
  price_tiers?: PriceTier[];
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, price_tiers, ...data }: UpdateProductPayload) => {
      // Update the product
      const { error: productError } = await supabase
        .from("products")
        .update(data)
        .eq("id", id);

      if (productError) throw productError;

      // Handle price tiers update
      if (data.pricing_type === "tiered" && price_tiers) {
        // Delete existing tiers
        const { error: deleteError } = await supabase
          .from("product_price_tiers")
          .delete()
          .eq("product_id", id);

        if (deleteError) throw deleteError;

        // Insert new tiers
        const tiersToInsert = price_tiers
          .filter((t) => t.cumulative_price > 0)
          .map((t) => ({
            product_id: id,
            day_count: t.day_count,
            cumulative_price: t.cumulative_price,
          }));

        if (tiersToInsert.length > 0) {
          const { error: tiersError } = await supabase
            .from("product_price_tiers")
            .insert(tiersToInsert);

          if (tiersError) throw tiersError;
        }
      } else if (data.pricing_type !== "tiered") {
        // If switching away from tiered, delete existing tiers
        await supabase
          .from("product_price_tiers")
          .delete()
          .eq("product_id", id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produkt aktualisiert");
    },
    onError: (error) => {
      console.error("Error updating product:", error);
      toast.error("Fehler beim Speichern");
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("products")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produkt gelöscht");
    },
    onError: (error) => {
      console.error("Error deleting product:", error);
      toast.error("Fehler beim Löschen");
    },
  });
}
