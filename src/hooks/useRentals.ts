import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface RentalWithDetails {
  id: string;
  instructor_id: string;
  office_user_id: string;
  rental_period_start: string;
  rental_period_end: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  instructor?: { id: string; first_name: string; last_name: string } | null;
  items?: RentalItemWithDetails[];
}

export interface RentalItemWithDetails {
  id: string;
  rental_id: string;
  item_id: string;
  status: string;
  returned_at: string | null;
  return_condition: string | null;
  notes: string | null;
  created_at: string;
  item?: { id: string; name: string; inventory_number: string | null; size: string | null; color: string | null; category?: { name: string } | null } | null;
}

export function useRentals() {
  return useQuery({
    queryKey: ["inventory-rentals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_rentals")
        .select(`
          *,
          instructor:instructor_id(id, first_name, last_name),
          items:inventory_rental_items(
            *,
            item:item_id(id, name, inventory_number, size, color, category:category_id(name))
          )
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as RentalWithDetails[];
    },
  });
}

export function useInstructorRentals(instructorId: string | null) {
  return useQuery({
    queryKey: ["instructor-rentals", instructorId],
    enabled: !!instructorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_rentals")
        .select(`
          *,
          instructor:instructor_id(id, first_name, last_name),
          items:inventory_rental_items(
            *,
            item:item_id(id, name, inventory_number, size, color, category:category_id(name))
          )
        `)
        .eq("instructor_id", instructorId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as RentalWithDetails[];
    },
  });
}

export function useCreateRental() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: {
      instructor_id: string;
      office_user_id: string;
      rental_period_start: string;
      rental_period_end?: string | null;
      item_ids: string[];
    }) => {
      const { item_ids, ...rentalData } = values;
      const { data: rental, error: rentalError } = await supabase
        .from("inventory_rentals")
        .insert(rentalData)
        .select()
        .single();
      if (rentalError) throw rentalError;

      // Create rental items
      const rentalItems = item_ids.map((item_id) => ({
        rental_id: rental.id,
        item_id,
      }));
      const { error: itemsError } = await supabase
        .from("inventory_rental_items")
        .insert(rentalItems);
      if (itemsError) throw itemsError;

      // Update item statuses to Ausgeliehen
      const { error: statusError } = await supabase
        .from("inventory_items")
        .update({ status: "Ausgeliehen" as any })
        .in("id", item_ids);
      if (statusError) throw statusError;

      return rental;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-rentals"] });
      qc.invalidateQueries({ queryKey: ["inventory-items"] });
      toast({ title: "Ausleihe erstellt" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });
}

export function useConfirmRental() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rentalId: string) => {
      const { error: rentalError } = await supabase
        .from("inventory_rentals")
        .update({ status: "Ausgeliehen" as any })
        .eq("id", rentalId);
      if (rentalError) throw rentalError;

      const { error: itemsError } = await supabase
        .from("inventory_rental_items")
        .update({ status: "Ausgeliehen" as any })
        .eq("rental_id", rentalId);
      if (itemsError) throw itemsError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-rentals"] });
      qc.invalidateQueries({ queryKey: ["instructor-rentals"] });
      toast({ title: "Empfang bestätigt" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });
}

export function useInitiateReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemIds: string[]) => {
      const { error } = await supabase
        .from("inventory_rental_items")
        .update({ status: "Rückgabe initiiert" as any })
        .in("id", itemIds);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-rentals"] });
      qc.invalidateQueries({ queryKey: ["instructor-rentals"] });
      toast({ title: "Rückgabe initiiert" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });
}

export function useCompleteReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: { id: string; item_id: string; return_condition: string; notes?: string }[]) => {
      for (const item of items) {
        const { error } = await supabase
          .from("inventory_rental_items")
          .update({
            status: "Zurückgegeben" as any,
            returned_at: new Date().toISOString(),
            return_condition: item.return_condition as any,
            notes: item.notes || null,
          })
          .eq("id", item.id);
        if (error) throw error;

        // Update inventory item status
        const newStatus = item.return_condition === "Verloren" ? "Verloren" : "Verfügbar";
        const { error: itemError } = await supabase
          .from("inventory_items")
          .update({ status: newStatus as any })
          .eq("id", item.item_id);
        if (itemError) throw itemError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-rentals"] });
      qc.invalidateQueries({ queryKey: ["instructor-rentals"] });
      qc.invalidateQueries({ queryKey: ["inventory-items"] });
      qc.invalidateQueries({ queryKey: ["action-counts-dashboard"] });
      toast({ title: "Rückgabe abgeschlossen" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateRentalStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ rentalId, status }: { rentalId: string; status: string }) => {
      const { error } = await supabase
        .from("inventory_rentals")
        .update({ status: status as any })
        .eq("id", rentalId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inventory-rentals"] });
      qc.invalidateQueries({ queryKey: ["instructor-rentals"] });
    },
  });
}

export function usePendingReturnsCount() {
  return useQuery({
    queryKey: ["pending-returns-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("inventory_rental_items")
        .select("id", { count: "exact", head: true })
        .eq("status", "Rückgabe initiiert" as any);
      if (error) throw error;
      return count || 0;
    },
  });
}
