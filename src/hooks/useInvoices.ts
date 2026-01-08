import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { generateQRReference } from "@/lib/swiss-qr-utils";
import { addDays } from "date-fns";

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
      return data as Invoice[];
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
      return data as InvoiceWithDetails;
    },
    enabled: !!invoiceId,
  });
}

interface CreateInvoiceInput {
  ticketId: string;
  customerId: string;
  subtotal: number;
  discount?: number;
  total: number;
  dueDays?: number;
}

export function useCreateInvoice() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: CreateInvoiceInput) => {
      const dueDate = addDays(new Date(), input.dueDays || 14);
      
      // Generate a temporary reference - will be updated with actual invoice number
      const tempRef = generateQRReference(`${Date.now()}`);
      
      // Use type assertion since we know the table exists
      const { data, error } = await supabase
        .from("invoices")
        .insert([{
          ticket_id: input.ticketId,
          customer_id: input.customerId,
          subtotal: input.subtotal,
          discount: input.discount || 0,
          total: input.total,
          qr_reference: tempRef,
          due_date: dueDate.toISOString().split('T')[0],
          status: 'draft',
        }] as any)
        .select()
        .single();
      
      if (error) throw error;
      
      // Update QR reference with actual invoice number
      const qrReference = generateQRReference(data.invoice_number);
      const { data: updatedInvoice, error: updateError } = await supabase
        .from("invoices")
        .update({ qr_reference: qrReference })
        .eq("id", data.id)
        .select()
        .single();
      
      if (updateError) throw updateError;
      
      return updatedInvoice as Invoice;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice", data.id] });
      toast.success(`Rechnung ${data.invoice_number} erstellt`);
    },
    onError: (error) => {
      console.error("Failed to create invoice:", error);
      toast.error("Fehler beim Erstellen der Rechnung");
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
      const updates: Partial<Invoice> = { status };
      if (sentAt) updates.sent_at = sentAt;
      if (paidAt) updates.paid_at = paidAt;
      
      const { data, error } = await supabase
        .from("invoices")
        .update(updates)
        .eq("id", invoiceId)
        .select()
        .single();
      
      if (error) throw error;
      return data as Invoice;
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
