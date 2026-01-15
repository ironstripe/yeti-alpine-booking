import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AIConfigurationItem {
  key: string;
  value: string;
  updated_at: string;
}

export interface AIKnowledgeDocument {
  id: string;
  file_name: string;
  storage_path: string;
  file_type: string;
  created_at: string;
}

export function useAIConfiguration() {
  return useQuery({
    queryKey: ["ai-configuration"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_configuration")
        .select("*");

      if (error) throw error;
      return data as AIConfigurationItem[];
    },
  });
}

export function useUpdateAIConfiguration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (configs: { key: string; value: string }[]) => {
      for (const config of configs) {
        const { error } = await supabase
          .from("ai_configuration")
          .upsert(
            { key: config.key, value: config.value, updated_at: new Date().toISOString() },
            { onConflict: "key" }
          );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-configuration"] });
      toast.success("KI-Einstellungen gespeichert");
    },
    onError: (error) => {
      console.error("Error updating AI configuration:", error);
      toast.error("Fehler beim Speichern der KI-Einstellungen");
    },
  });
}

export function useAIKnowledgeDocuments() {
  return useQuery({
    queryKey: ["ai-knowledge-documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_knowledge_documents")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as AIKnowledgeDocument[];
    },
  });
}

export function useUploadKnowledgeDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const fileExt = file.name.split(".").pop();
      const storagePath = `${crypto.randomUUID()}.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from("ai_knowledge_base")
        .upload(storagePath, file);

      if (uploadError) throw uploadError;

      // Create database record
      const { error: dbError } = await supabase
        .from("ai_knowledge_documents")
        .insert({
          file_name: file.name,
          storage_path: storagePath,
          file_type: file.type || "text/plain",
        });

      if (dbError) {
        // Clean up uploaded file if DB insert fails
        await supabase.storage.from("ai_knowledge_base").remove([storagePath]);
        throw dbError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-knowledge-documents"] });
      toast.success("Dokument erfolgreich hochgeladen");
    },
    onError: (error) => {
      console.error("Error uploading document:", error);
      toast.error("Fehler beim Hochladen des Dokuments");
    },
  });
}

export function useDeleteKnowledgeDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (document: AIKnowledgeDocument) => {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("ai_knowledge_base")
        .remove([document.storage_path]);

      if (storageError) {
        console.error("Storage delete error:", storageError);
        // Continue to delete DB record even if storage delete fails
      }

      // Delete database record
      const { error: dbError } = await supabase
        .from("ai_knowledge_documents")
        .delete()
        .eq("id", document.id);

      if (dbError) throw dbError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-knowledge-documents"] });
      toast.success("Dokument gelöscht");
    },
    onError: (error) => {
      console.error("Error deleting document:", error);
      toast.error("Fehler beim Löschen des Dokuments");
    },
  });
}
