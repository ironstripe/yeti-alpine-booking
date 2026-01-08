import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Voucher {
  id: string;
  code: string;
  original_value: number;
  remaining_balance: number;
  expiry_date: string;
  status: "active" | "partial" | "redeemed" | "expired" | "cancelled";
  buyer_customer_id: string | null;
  buyer_name: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  recipient_name: string | null;
  recipient_message: string | null;
  payment_method: string | null;
  is_paid: boolean;
  internal_note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VoucherRedemption {
  id: string;
  voucher_id: string;
  ticket_id: string | null;
  amount: number;
  balance_after: number;
  reason: string | null;
  redeemed_by: string | null;
  redeemed_at: string;
  ticket?: {
    ticket_number: string;
    customer?: {
      first_name: string | null;
      last_name: string;
    };
  };
}

export interface VoucherStats {
  activeCount: number;
  totalOpenValue: number;
  expiringCount: number;
  redeemedThisSeason: number;
}

// Fetch all vouchers
export function useVouchers(statusFilter?: string, search?: string) {
  return useQuery({
    queryKey: ["vouchers", statusFilter, search],
    queryFn: async () => {
      let query = supabase
        .from("vouchers")
        .select("*")
        .order("created_at", { ascending: false });

      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      if (search) {
        query = query.or(`code.ilike.%${search}%,buyer_name.ilike.%${search}%,buyer_email.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Voucher[];
    },
  });
}

// Fetch single voucher with redemptions
export function useVoucher(id: string) {
  return useQuery({
    queryKey: ["voucher", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vouchers")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as Voucher;
    },
    enabled: !!id,
  });
}

// Fetch voucher by code (for redemption lookup)
export function useVoucherByCode(code: string) {
  return useQuery({
    queryKey: ["voucher-code", code],
    queryFn: async () => {
      if (!code || code.length < 5) return null;
      
      const { data, error } = await supabase
        .from("vouchers")
        .select("*")
        .eq("code", code.toUpperCase())
        .maybeSingle();

      if (error) throw error;
      return data as Voucher | null;
    },
    enabled: code.length >= 5,
  });
}

// Fetch redemptions for a voucher
export function useVoucherRedemptions(voucherId: string) {
  return useQuery({
    queryKey: ["voucher-redemptions", voucherId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voucher_redemptions")
        .select(`
          *,
          ticket:tickets (
            ticket_number,
            customer:customers (
              first_name,
              last_name
            )
          )
        `)
        .eq("voucher_id", voucherId)
        .order("redeemed_at", { ascending: false });

      if (error) throw error;
      return data as VoucherRedemption[];
    },
    enabled: !!voucherId,
  });
}

// Fetch voucher stats
export function useVoucherStats() {
  return useQuery({
    queryKey: ["voucher-stats"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      const seasonStart = `${new Date().getFullYear()}-11-01`;

      // Get active vouchers count and open value
      const { data: activeVouchers } = await supabase
        .from("vouchers")
        .select("remaining_balance")
        .in("status", ["active", "partial"])
        .gte("expiry_date", today);

      // Get expiring soon count
      const { data: expiringVouchers } = await supabase
        .from("vouchers")
        .select("id")
        .in("status", ["active", "partial"])
        .gte("expiry_date", today)
        .lte("expiry_date", thirtyDaysFromNow);

      // Get redeemed this season
      const { data: redemptions } = await supabase
        .from("voucher_redemptions")
        .select("amount")
        .gte("redeemed_at", seasonStart);

      return {
        activeCount: activeVouchers?.length || 0,
        totalOpenValue: activeVouchers?.reduce((sum, v) => sum + (v.remaining_balance || 0), 0) || 0,
        expiringCount: expiringVouchers?.length || 0,
        redeemedThisSeason: redemptions?.reduce((sum, r) => sum + (r.amount || 0), 0) || 0,
      } as VoucherStats;
    },
  });
}

// Create voucher
export function useCreateVoucher() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (voucher: Partial<Omit<Voucher, "id" | "code" | "created_at" | "updated_at">>) => {
      const { data: user } = await supabase.auth.getUser();
      
      const { data, error } = await supabase
        .from("vouchers")
        .insert({
          code: `TEMP-${Date.now()}`, // Will be replaced by trigger
          original_value: voucher.original_value!,
          remaining_balance: voucher.remaining_balance!,
          expiry_date: voucher.expiry_date!,
          status: voucher.status || "active",
          buyer_customer_id: voucher.buyer_customer_id,
          buyer_name: voucher.buyer_name,
          buyer_email: voucher.buyer_email,
          buyer_phone: voucher.buyer_phone,
          recipient_name: voucher.recipient_name,
          recipient_message: voucher.recipient_message,
          payment_method: voucher.payment_method,
          is_paid: voucher.is_paid ?? true,
          internal_note: voucher.internal_note,
          created_by: user.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Voucher;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["voucher-stats"] });
      toast.success("Gutschein erstellt");
    },
    onError: (error) => {
      toast.error("Fehler: " + error.message);
    },
  });
}

// Update voucher
export function useUpdateVoucher() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Voucher> & { id: string }) => {
      const { data, error } = await supabase
        .from("vouchers")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Voucher;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["voucher", data.id] });
      queryClient.invalidateQueries({ queryKey: ["voucher-stats"] });
      toast.success("Gutschein aktualisiert");
    },
    onError: (error) => {
      toast.error("Fehler: " + error.message);
    },
  });
}

// Redeem voucher
export function useRedeemVoucher() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      voucherId,
      amount,
      ticketId,
      reason,
    }: {
      voucherId: string;
      amount: number;
      ticketId?: string;
      reason?: string;
    }) => {
      // Get current voucher
      const { data: voucher, error: fetchError } = await supabase
        .from("vouchers")
        .select("remaining_balance, status, expiry_date")
        .eq("id", voucherId)
        .single();

      if (fetchError) throw fetchError;
      if (!voucher) throw new Error("Gutschein nicht gefunden");

      // Validate
      if (voucher.status === "cancelled") throw new Error("Gutschein wurde storniert");
      if (voucher.status === "expired" || new Date(voucher.expiry_date) < new Date()) {
        throw new Error("Gutschein ist abgelaufen");
      }
      if (amount > voucher.remaining_balance) {
        throw new Error("Betrag übersteigt Restguthaben");
      }

      const { data: user } = await supabase.auth.getUser();
      const balanceAfter = voucher.remaining_balance - amount;

      const { data, error } = await supabase
        .from("voucher_redemptions")
        .insert({
          voucher_id: voucherId,
          ticket_id: ticketId || null,
          amount,
          balance_after: balanceAfter,
          reason: reason || null,
          redeemed_by: user.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["voucher", variables.voucherId] });
      queryClient.invalidateQueries({ queryKey: ["voucher-redemptions", variables.voucherId] });
      queryClient.invalidateQueries({ queryKey: ["voucher-stats"] });
      toast.success("Gutschein eingelöst");
    },
    onError: (error) => {
      toast.error("Fehler: " + error.message);
    },
  });
}

// Cancel voucher
export function useCancelVoucher() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("vouchers")
        .update({ status: "cancelled" })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["voucher-stats"] });
      toast.success("Gutschein storniert");
    },
    onError: (error) => {
      toast.error("Fehler: " + error.message);
    },
  });
}

// Extend voucher expiry
export function useExtendVoucher() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, newExpiryDate }: { id: string; newExpiryDate: string }) => {
      const { error } = await supabase
        .from("vouchers")
        .update({ 
          expiry_date: newExpiryDate,
          status: "active", // Reactivate if was expired
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["voucher", variables.id] });
      queryClient.invalidateQueries({ queryKey: ["voucher-stats"] });
      toast.success("Gültigkeit verlängert");
    },
    onError: (error) => {
      toast.error("Fehler: " + error.message);
    },
  });
}
