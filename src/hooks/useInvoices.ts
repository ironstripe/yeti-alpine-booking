import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { PaymentSnapshot, RoutingResult } from "@/lib/payments";

export interface Invoice {
  id: string;
  invoice_number: string;
  ticket_id: string | null;
  customer_id: string | null;
  subtotal: number;
  discount: number;
  total: number;
  currency: string;
  qr_reference: string;
  invoice_date: string;
  due_date: string;
  status: string;
  sent_at: string | null;
  paid_at: string | null;
  pdf_url: string | null;
  created_at: string;
  payment_profile_id?: string | null;
  payment_presentation_type?: string | null;
  payment_snapshot?: PaymentSnapshot | null;
  payment_reference_type?: string | null;
  payment_reference?: string | null;
  payment_routing_reason?: string | null;
  payment_profile_overridden?: boolean | null;
  is_legacy_payment?: boolean | null;
  issued_at?: string | null;
}


export interface InvoiceWithDetails extends Invoice {
  ticket?: {
    ticket_number: string;
    customer: {
      id: string;
      first_name: string | null;
      last_name: string;
      email: string;
      street: string | null;
      zip: string | null;
      city: string | null;
      country: string | null;
    };
  };
}

export function useInvoicesByTicket(ticketId: string | undefined) {
  return useQuery({
    queryKey: ["invoices", "ticket", ticketId],
    queryFn: async () => {
      if (!ticketId) return [];
      
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as unknown as Invoice[];
    },
    enabled: !!ticketId,
  });
}

export function useInvoice(invoiceId: string | undefined) {
  return useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: async () => {
      if (!invoiceId) return null;
      
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          *,
          ticket:tickets(
            ticket_number,
            customer:customers(
              id, first_name, last_name, email, street, zip, city, country
            )
          )
        `)
        .eq("id", invoiceId)
        .single();
      
      if (error) throw error;
      return data as unknown as InvoiceWithDetails;
    },
    enabled: !!invoiceId,
  });
}

interface CreateInvoiceInput {
  ticketId: string;
  customerId?: string | null;
  billingPartnerId?: string | null;
  subtotal: number;
  discount?: number;
  total: number;
  currency?: string;
  dueDays?: number;
  overrideProfileId?: string | null;
  overrideReason?: string | null;
  allowAdditional?: boolean;
}

/**
 * Issues an invoice through the server. Payment routing, reference generation
 * and the immutable payment snapshot are decided by the backend, never here.
 */
export function useCreateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateInvoiceInput) => {
      const { data, error } = await supabase.functions.invoke("issue-invoice", {
        body: {
          action: "issue",
          ticketId: input.ticketId,
          customerId: input.customerId ?? null,
          billingPartnerId: input.billingPartnerId ?? null,
          subtotal: input.subtotal,
          discount: input.discount ?? 0,
          total: input.total,
          currency: input.currency ?? "CHF",
          dueDays: input.dueDays ?? 14,
          overrideProfileId: input.overrideProfileId ?? null,
          overrideReason: input.overrideReason ?? null,
          allowAdditional: input.allowAdditional ?? false,
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Rechnung konnte nicht erstellt werden");

      return data.invoice as Invoice;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice", data.id] });
      toast.success(`Rechnung ${data.invoice_number} erstellt`);
    },
    onError: (error: Error) => {
      console.error("Failed to create invoice:", error);
      toast.error(error.message || "Fehler beim Erstellen der Rechnung");
    },
  });
}

/** Shows which bank account and reference type an invoice would use, before issuing. */
export function useInvoiceRoutingPreview() {
  return useMutation({
    mutationFn: async (input: {
      ticketId: string;
      customerId?: string | null;
      billingPartnerId?: string | null;
      currency?: string;
      overrideProfileId?: string | null;
      overrideReason?: string | null;
    }) => {
      const { data, error } = await supabase.functions.invoke("issue-invoice", {
        body: { action: "preview", ...input },
      });
      if (error) throw error;
      return data as RoutingResult & { ok: boolean; error?: string };
    },
  });
}


export function useUpdateInvoiceStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      invoiceId, 
      status, 
      sentAt, 
      paidAt 
    }: { 
      invoiceId: string; 
      status: string;
      sentAt?: string;
      paidAt?: string;
    }) => {
      const updates: Record<string, unknown> = { status };
      if (sentAt) updates.sent_at = sentAt;
      if (paidAt) updates.paid_at = paidAt;
      
      const { data, error } = await supabase
        .from("invoices")
        .update(updates as never)
        .eq("id", invoiceId)
        .select()
        .single();
      
      if (error) throw error;
      return data as unknown as Invoice;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice", data.id] });
    },
    onError: (error) => {
      console.error("Failed to update invoice status:", error);
      toast.error("Fehler beim Aktualisieren des Status");
    },
  });
}

export function useSendInvoice() {
  const updateStatus = useUpdateInvoiceStatus();
  
  return useMutation({
    mutationFn: async ({ invoiceId, recipientEmail }: { invoiceId: string; recipientEmail: string }) => {
      // Call edge function to send invoice email
      const { data, error } = await supabase.functions.invoke("send-notification", {
        body: {
          type: "invoice",
          invoiceId,
          recipientEmail,
        },
      });
      
      if (error) throw error;
      
      // Update status to sent
      await updateStatus.mutateAsync({
        invoiceId,
        status: 'sent',
        sentAt: new Date().toISOString(),
      });
      
      return data;
    },
    onSuccess: () => {
      toast.success("Rechnung per E-Mail gesendet");
    },
    onError: (error) => {
      console.error("Failed to send invoice:", error);
      toast.error("Fehler beim Senden der Rechnung");
    },
  });
}

export function useMarkInvoicePaid() {
  const updateStatus = useUpdateInvoiceStatus();
  
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      return updateStatus.mutateAsync({
        invoiceId,
        status: 'paid',
        paidAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      toast.success("Rechnung als bezahlt markiert");
    },
  });
}
