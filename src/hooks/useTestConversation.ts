import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const SAMPLE_MESSAGES = {
  complete: {
    label: "Vollständige Anfrage (Hohe Konfidenz)",
    subject: "Skikurs für Familie Streiff",
    content: `Guten Tag,

wir sind vom 15. bis 20. Januar im Hotel Gorfion in Malbun und möchten gerne Skikurse für unsere beiden Kinder buchen:

- Emma (8 Jahre, geboren 12.05.2017) - Anfängerin, hatte noch nie Skier an
- Lukas (11 Jahre, geboren 03.08.2013) - kann schon ein bisschen, war letztes Jahr in einem Gruppenkurs

Wir hätten gerne Privatunterricht am Vormittag (09:00-12:00). Falls möglich, würden wir uns über eine Lehrerin freuen, die gut mit Kindern umgehen kann.

Mittagsbetreuung wäre für beide Kinder gewünscht.

Mit freundlichen Grüssen,
Ivo Streiff
ivo.streiff@gmail.com
+41 79 123 45 67`,
  },
  incomplete: {
    label: "Unvollständige Anfrage (Niedrige Konfidenz)",
    subject: "Anfrage Skikurs",
    content: `Hallo,

können wir nächste Woche Skikurse buchen? Wir sind zu viert und wohnen im Turna.

Danke`,
  },
  nonBooking: {
    label: "Keine Buchungsanfrage",
    subject: "Frage zum Treffpunkt",
    content: `Hallo,

wo ist eigentlich der Treffpunkt für den Skikurs morgen? Wir haben das vergessen.

Danke!`,
  },
};

export type SampleKey = keyof typeof SAMPLE_MESSAGES;

interface CreateTestConversationParams {
  content: string;
  subject?: string;
  senderEmail?: string;
  senderName?: string;
}

export function useTestConversation() {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async ({
      content,
      subject,
      senderEmail = "ivo.streiff@gmail.com",
      senderName = "Ivo Streiff",
    }: CreateTestConversationParams) => {
      // 1. Insert test conversation
      const { data: conversation, error: insertError } = await supabase
        .from("conversations")
        .insert({
          channel: "email",
          direction: "inbound",
          contact_identifier: senderEmail,
          contact_name: senderName,
          subject: subject || null,
          content,
          status: "unread",
        })
        .select()
        .single();

      if (insertError) throw insertError;

      return conversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["conversation-counts"] });
      queryClient.invalidateQueries({ queryKey: ["inbox-stats"] });
    },
    onError: (error) => {
      console.error("Error creating test conversation:", error);
      toast.error("Fehler beim Erstellen der Test-Nachricht");
    },
  });

  const triggerExtraction = useMutation({
    mutationFn: async (conversationId: string) => {
      const { data, error } = await supabase.functions.invoke("process-ai-message", {
        body: { conversationId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (data?.isBookingRequest) {
        toast.success("KI-Extraktion abgeschlossen", {
          description: `Konfidenz: ${Math.round((data.confidence || 0) * 100)}%`,
        });
      } else {
        toast.info("Keine Buchungsanfrage erkannt");
      }
    },
    onError: (error) => {
      console.error("AI extraction error:", error);
      toast.error("KI-Extraktion fehlgeschlagen");
    },
  });

  return {
    createConversation: createMutation.mutateAsync,
    triggerExtraction: triggerExtraction.mutateAsync,
    isCreating: createMutation.isPending,
    isExtracting: triggerExtraction.isPending,
  };
}
