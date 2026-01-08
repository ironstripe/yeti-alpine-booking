import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

export interface EmailTemplate {
  id: string;
  name: string;
  trigger: string;
  subject: string;
  body_html: string;
  body_text: string | null;
  variables: Json | null;
  attachments: Json | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export function useEmailTemplates() {
  return useQuery({
    queryKey: ["email-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .order("name");

      if (error) throw error;
      return data as EmailTemplate[];
    },
  });
}

export function useEmailTemplate(id: string | undefined) {
  return useQuery({
    queryKey: ["email-template", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as EmailTemplate;
    },
    enabled: !!id,
  });
}

export function useUpdateEmailTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<EmailTemplate>;
    }) => {
      const { data, error } = await supabase
        .from("email_templates")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      queryClient.invalidateQueries({ queryKey: ["email-template", variables.id] });
      toast.success("Vorlage gespeichert");
    },
    onError: (error) => {
      console.error("Failed to update template:", error);
      toast.error("Fehler beim Speichern");
    },
  });
}

export function useToggleEmailTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from("email_templates")
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      toast.success("Status aktualisiert");
    },
    onError: (error) => {
      console.error("Failed to toggle template:", error);
      toast.error("Fehler beim Aktualisieren");
    },
  });
}

export function useSendTestEmail() {
  return useMutation({
    mutationFn: async ({
      templateId,
      recipientEmail,
      testData,
    }: {
      templateId: string;
      recipientEmail: string;
      testData: Record<string, unknown>;
    }) => {
      const response = await supabase.functions.invoke("send-notification", {
        body: {
          type: "test",
          templateId,
          recipientEmail,
          recipientName: "Test User",
          data: testData,
        },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      toast.success("Test-E-Mail gesendet");
    },
    onError: (error) => {
      console.error("Failed to send test email:", error);
      toast.error("Fehler beim Senden der Test-E-Mail");
    },
  });
}
