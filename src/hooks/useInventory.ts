import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface InventoryCategory {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  category_id: string | null;
  name: string;
  inventory_number: string | null;
  size: string | null;
  color: string | null;
  condition: string;
  status: string;
  created_at: string;
  updated_at: string;
  category?: InventoryCategory | null;
}

export const SIZES = ["S", "M", "L", "XL", "XXL", "XXXL"] as const;
export const CONDITIONS = ["Neu", "Ok", "Ausgebleicht", "Ersetzen"] as const;
export const ITEM_STATUSES = ["Verfügbar", "Ausgeliehen", "Verloren", "In Reparatur"] as const;

// ─── Categories ───

export function useInventoryCategories() {
  return useQuery({
    queryKey: ["inventory-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_categories")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as InventoryCategory[];
    },
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: { name: string; description?: string }) => {
      const { data, error } = await supabase
        .from("inventory_categories")
        .insert(values)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-categories"] });
      toast({ title: "Kategorie erstellt" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: { id: string; name: string; description?: string }) => {
      const { error } = await supabase.from("inventory_categories").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-categories"] });
      toast({ title: "Kategorie aktualisiert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inventory_categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-categories"] });
      toast({ title: "Kategorie gelöscht" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });
}

// ─── Items ───

export function useInventoryItems() {
  return useQuery({
    queryKey: ["inventory-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_items")
        .select("*, category:category_id(id, name)")
        .order("name");
      if (error) throw error;
      return data as InventoryItem[];
    },
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      name: string;
      category_id?: string | null;
      inventory_number?: string | null;
      size?: string | null;
      color?: string | null;
      condition?: string;
      status?: string;
    }) => {
      const { data, error } = await supabase
        .from("inventory_items")
        .insert(values as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-items"] });
      toast({ title: "Artikel erstellt" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...values }: {
      id: string;
      name?: string;
      category_id?: string | null;
      inventory_number?: string | null;
      size?: string | null;
      color?: string | null;
      condition?: string;
      status?: string;
    }) => {
      const { error } = await supabase.from("inventory_items").update(values as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-items"] });
      toast({ title: "Artikel aktualisiert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inventory_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-items"] });
      toast({ title: "Artikel gelöscht" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });
}
