import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ShopArticle {
  id: string;
  name: string;
  sku: string;
  description: string | null;
  category: string;
  price: number;
  cost_price: number | null;
  stock_quantity: number;
  min_stock: number;
  image_url: string | null;
  status: "active" | "inactive" | "sold_out";
  has_variants: boolean;
  is_popular: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShopArticleVariant {
  id: string;
  article_id: string;
  name: string;
  sku: string;
  price: number | null;
  stock_quantity: number;
  created_at: string;
}

export interface ShopTransaction {
  id: string;
  transaction_number: string;
  date: string;
  subtotal: number;
  discount_amount: number;
  discount_percent: number | null;
  discount_reason: string | null;
  total: number;
  payment_method: "cash" | "card" | "twint" | "invoice";
  linked_ticket_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ShopTransactionItem {
  id: string;
  transaction_id: string;
  article_id: string;
  variant_id: string | null;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface CartItem {
  article: ShopArticle;
  variant?: ShopArticleVariant;
  quantity: number;
}

// Fetch all articles
export function useShopArticles(category?: string, status?: string) {
  return useQuery({
    queryKey: ["shop-articles", category, status],
    queryFn: async () => {
      let query = supabase
        .from("shop_articles")
        .select("*")
        .order("name");

      if (category && category !== "all") {
        query = query.eq("category", category);
      }

      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as ShopArticle[];
    },
  });
}

// Fetch single article with variants
export function useShopArticle(id: string | undefined) {
  return useQuery({
    queryKey: ["shop-article", id],
    queryFn: async () => {
      if (!id) return null;

      const { data: article, error: articleError } = await supabase
        .from("shop_articles")
        .select("*")
        .eq("id", id)
        .single();

      if (articleError) throw articleError;

      const { data: variants, error: variantsError } = await supabase
        .from("shop_article_variants")
        .select("*")
        .eq("article_id", id)
        .order("name");

      if (variantsError) throw variantsError;

      return {
        article: article as ShopArticle,
        variants: variants as ShopArticleVariant[],
      };
    },
    enabled: !!id,
  });
}

// Fetch popular articles for quick POS
export function usePopularArticles() {
  return useQuery({
    queryKey: ["shop-articles-popular"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_articles")
        .select("*")
        .eq("is_popular", true)
        .eq("status", "active")
        .order("name")
        .limit(10);

      if (error) throw error;
      return data as ShopArticle[];
    },
  });
}

// Fetch transactions
export function useShopTransactions(startDate?: Date, endDate?: Date) {
  return useQuery({
    queryKey: ["shop-transactions", startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from("shop_transactions")
        .select(`
          *,
          shop_transaction_items (
            *,
            shop_articles (name, sku)
          )
        `)
        .order("date", { ascending: false });

      if (startDate) {
        query = query.gte("date", startDate.toISOString());
      }
      if (endDate) {
        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);
        query = query.lte("date", endOfDay.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    },
  });
}

// Shop stats for dashboard
export function useShopStats(date: Date) {
  return useQuery({
    queryKey: ["shop-stats", date.toISOString().split("T")[0]],
    queryFn: async () => {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      // Get today's transactions
      const { data: transactions, error: transError } = await supabase
        .from("shop_transactions")
        .select("total")
        .gte("date", startOfDay.toISOString())
        .lte("date", endOfDay.toISOString());

      if (transError) throw transError;

      // Get article counts
      const { data: articles, error: articlesError } = await supabase
        .from("shop_articles")
        .select("id, stock_quantity, min_stock, status")
        .eq("status", "active");

      if (articlesError) throw articlesError;

      const todayRevenue = transactions?.reduce((sum, t) => sum + Number(t.total), 0) || 0;
      const salesCount = transactions?.length || 0;
      const totalArticles = articles?.length || 0;
      const lowStockCount = articles?.filter(a => a.stock_quantity <= a.min_stock).length || 0;

      return {
        todayRevenue,
        salesCount,
        totalArticles,
        lowStockCount,
      };
    },
  });
}

// Create article
export function useCreateArticle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (article: Omit<ShopArticle, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase
        .from("shop_articles")
        .insert(article)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shop-articles"] });
      toast.success("Artikel erstellt");
    },
    onError: (error) => {
      console.error("Error creating article:", error);
      toast.error("Fehler beim Erstellen des Artikels");
    },
  });
}

// Update article
export function useUpdateArticle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...article }: Partial<ShopArticle> & { id: string }) => {
      const { data, error } = await supabase
        .from("shop_articles")
        .update(article)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shop-articles"] });
      queryClient.invalidateQueries({ queryKey: ["shop-article"] });
      toast.success("Artikel aktualisiert");
    },
    onError: (error) => {
      console.error("Error updating article:", error);
      toast.error("Fehler beim Aktualisieren des Artikels");
    },
  });
}

// Delete article
export function useDeleteArticle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("shop_articles")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shop-articles"] });
      toast.success("Artikel gelöscht");
    },
    onError: (error) => {
      console.error("Error deleting article:", error);
      toast.error("Fehler beim Löschen des Artikels");
    },
  });
}

// Adjust stock
export function useAdjustStock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      articleId,
      variantId,
      quantity,
      type,
      reason,
    }: {
      articleId: string;
      variantId?: string;
      quantity: number;
      type: "purchase" | "adjustment" | "return";
      reason?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Record stock movement
      const { error: movementError } = await supabase
        .from("shop_stock_movements")
        .insert({
          article_id: articleId,
          variant_id: variantId || null,
          type,
          quantity,
          reason: reason || null,
          created_by: user?.id || null,
        });

      if (movementError) throw movementError;

      // Update stock quantity
      if (variantId) {
        const { data: variant } = await supabase
          .from("shop_article_variants")
          .select("stock_quantity")
          .eq("id", variantId)
          .single();

        const newQuantity = (variant?.stock_quantity || 0) + quantity;

        const { error: updateError } = await supabase
          .from("shop_article_variants")
          .update({ stock_quantity: newQuantity })
          .eq("id", variantId);

        if (updateError) throw updateError;
      } else {
        const { data: article } = await supabase
          .from("shop_articles")
          .select("stock_quantity")
          .eq("id", articleId)
          .single();

        const newQuantity = (article?.stock_quantity || 0) + quantity;

        const { error: updateError } = await supabase
          .from("shop_articles")
          .update({ stock_quantity: newQuantity })
          .eq("id", articleId);

        if (updateError) throw updateError;
      }

      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shop-articles"] });
      queryClient.invalidateQueries({ queryKey: ["shop-article"] });
      toast.success("Bestand angepasst");
    },
    onError: (error) => {
      console.error("Error adjusting stock:", error);
      toast.error("Fehler beim Anpassen des Bestands");
    },
  });
}

// Process sale
export function useProcessSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      items,
      subtotal,
      discountAmount,
      discountPercent,
      discountReason,
      total,
      paymentMethod,
      linkedTicketId,
    }: {
      items: CartItem[];
      subtotal: number;
      discountAmount: number;
      discountPercent: number | null;
      discountReason: string | null;
      total: number;
      paymentMethod: "cash" | "card" | "twint" | "invoice";
      linkedTicketId: string | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      // Create transaction
      const { data: transaction, error: transError } = await supabase
        .from("shop_transactions")
        .insert({
          subtotal,
          discount_amount: discountAmount,
          discount_percent: discountPercent,
          discount_reason: discountReason,
          total,
          payment_method: paymentMethod,
          linked_ticket_id: linkedTicketId,
          created_by: user?.id || null,
        })
        .select()
        .single();

      if (transError) throw transError;

      // Create transaction items
      const transactionItems = items.map((item) => ({
        transaction_id: transaction.id,
        article_id: item.article.id,
        variant_id: item.variant?.id || null,
        quantity: item.quantity,
        unit_price: item.variant?.price || item.article.price,
        total_price: (item.variant?.price || item.article.price) * item.quantity,
      }));

      const { error: itemsError } = await supabase
        .from("shop_transaction_items")
        .insert(transactionItems);

      if (itemsError) throw itemsError;

      // Update stock and record movements
      for (const item of items) {
        const quantity = -item.quantity; // Negative for sale

        const { error: movementError } = await supabase
          .from("shop_stock_movements")
          .insert({
            article_id: item.article.id,
            variant_id: item.variant?.id || null,
            type: "sale",
            quantity,
            reference_id: transaction.id,
            created_by: user?.id || null,
          });

        if (movementError) throw movementError;

        // Update article stock
        if (item.variant) {
          const { error: updateError } = await supabase
            .from("shop_article_variants")
            .update({
              stock_quantity: item.variant.stock_quantity + quantity,
            })
            .eq("id", item.variant.id);

          if (updateError) throw updateError;
        } else {
          const { error: updateError } = await supabase
            .from("shop_articles")
            .update({
              stock_quantity: item.article.stock_quantity + quantity,
            })
            .eq("id", item.article.id);

          if (updateError) throw updateError;
        }
      }

      return transaction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shop-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["shop-articles"] });
      queryClient.invalidateQueries({ queryKey: ["shop-stats"] });
      toast.success("Verkauf erfolgreich abgeschlossen");
    },
    onError: (error) => {
      console.error("Error processing sale:", error);
      toast.error("Fehler beim Abschliessen des Verkaufs");
    },
  });
}

// Get unique categories
export function useShopCategories() {
  return useQuery({
    queryKey: ["shop-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_articles")
        .select("category")
        .order("category");

      if (error) throw error;

      const categories = [...new Set(data.map((d) => d.category))];
      return categories;
    },
  });
}
