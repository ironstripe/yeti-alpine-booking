import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowLeft, 
  Mail, 
  MessageCircle, 
  Phone,
  User,
  Clock,
  RefreshCw,
  Trash2,
  ExternalLink
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { ExtractionPanel } from "@/components/inbox/ExtractionPanel";
import { ConvertToBookingButton } from "@/components/inbox/ConvertToBookingButton";
import { ClassificationBadge, type MessageClassification } from "@/components/inbox/ClassificationBadge";
import { AIReplyAssistant } from "@/components/inbox/AIReplyAssistant";
import { useTriggerAIExtraction, type ExtractedData } from "@/hooks/useAIExtraction";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const channelConfig: Record<string, { icon: typeof Mail; label: string; color: string }> = {
  email: { icon: Mail, label: "E-Mail", color: "text-blue-600" },
  whatsapp: { icon: MessageCircle, label: "WhatsApp", color: "text-green-600" },
  phone: { icon: Phone, label: "Telefon", color: "text-muted-foreground" },
};

export default function InboxDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const triggerExtraction = useTriggerAIExtraction();

  const { data: conversation, isLoading, error, refetch } = useQuery({
    queryKey: ["conversation", id],
    queryFn: async () => {
      if (!id) throw new Error("No ID provided");

      const { data, error } = await supabase
        .from("conversations")
        .select(`
          *,
          customers!customer_id (
            id,
            first_name,
            last_name,
            email,
            phone
          )
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Mark as read when viewing
  useQuery({
    queryKey: ["mark-read", id],
    queryFn: async () => {
      if (!id) return null;
      await supabase
        .from("conversations")
        .update({ status: "read" })
        .eq("id", id)
        .eq("status", "unread");
      return true;
    },
    enabled: !!id && conversation?.status === "unread",
  });

  const handleReprocess = async () => {
    if (!id) return;
    await triggerExtraction.mutateAsync(id);
    refetch();
  };

  const handleMarkAsSpam = async () => {
    if (!id) return;
    const { error } = await supabase
      .from("conversations")
      .update({ status: "spam" })
      .eq("id", id);

    if (error) {
      toast.error("Fehler beim Markieren als Spam");
    } else {
      toast.success("Als Spam markiert");
      navigate("/inbox");
    }
  };

  if (isLoading) {
    return (
      <>
        <PageHeader title="Nachricht laden..." />
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </>
    );
  }

  if (error || !conversation) {
    return (
      <>
        <PageHeader title="Fehler" />
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              Nachricht konnte nicht geladen werden.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => navigate("/inbox")}>
              Zurück zum Posteingang
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  const channel = channelConfig[conversation.channel] || channelConfig.email;
  const ChannelIcon = channel.icon;
  const extractedData = conversation.ai_extracted_data as unknown as ExtractedData | null;
  const hasExtraction = extractedData && extractedData.is_booking_request;

  // Use real classification from database, fallback to extracted data or 'other'
  const classification = (conversation.classification || extractedData?.classification || "other") as MessageClassification;
  
  // Build dynamic suggested reply based on missing information
  const missingInfo = (extractedData as any)?.missing_information as string[] | undefined;
  const detectedLanguage = (conversation as any).detected_language || "de";
  
  const buildMissingInfoText = () => {
    if (!missingInfo || missingInfo.length === 0) return "";
    
    const infoLabels: Record<string, string> = {
      start_date: "Gewünschtes Startdatum",
      end_date: "Enddatum",
      number_of_participants: "Anzahl der Teilnehmer",
      participant_ages: "Alter der Teilnehmer",
      skill_level: "Kenntnisstand (Anfänger/Fortgeschritten)",
      contact_phone: "Telefonnummer für Rückfragen",
      preferred_time: "Bevorzugte Tageszeit",
      discipline: "Sportart (Ski/Snowboard)",
    };
    
    return missingInfo
      .map(info => infoLabels[info] || info)
      .map(label => `- ${label}`)
      .join("\n");
  };

  const suggestedReply = {
    to: conversation.contact_identifier,
    subject: `Re: ${conversation.subject || "Ihre Anfrage"}`,
    body: detectedLanguage === "en" 
      ? `Dear ${extractedData?.customer?.name?.split(' ')[0] || "Guest"},

Thank you for your inquiry. We are happy to check availability for your requested dates.

${missingInfo && missingInfo.length > 0 ? `To prepare the booking for you, could you please confirm the following information?
${buildMissingInfoText()}

` : ""}We will get back to you shortly with a concrete proposal.

Best regards,
Your Yeti Team`
      : `Guten Tag${extractedData?.customer?.name ? ` ${extractedData.customer.name.split(' ')[0]}` : ""},

Vielen Dank für Ihre Anfrage. Gerne prüfen wir die Verfügbarkeit für Ihren gewünschten Termin.

${missingInfo && missingInfo.length > 0 ? `Um die Buchung für Sie optimal vorzubereiten, könnten Sie uns bitte noch folgende Informationen bestätigen?
${buildMissingInfoText()}

` : ""}Wir melden uns in Kürze mit einem konkreten Vorschlag.

Freundliche Grüsse,
Ihr Yeti Team`,
  };

  const handleMarkAsDone = async () => {
    if (!id) return;
    const { error } = await supabase
      .from("conversations")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      toast.error("Fehler beim Markieren als erledigt");
    } else {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["conversation-counts"] });
      navigate("/inbox");
    }
  };

  return (
    <>
      <PageHeader
        title="Nachricht"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/inbox")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Zurück
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Original Message */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <ChannelIcon className={cn("h-5 w-5", channel.color)} />
                    <Badge variant="outline">{channel.label}</Badge>
                    {conversation.direction === "inbound" && (
                      <Badge variant="secondary">Eingehend</Badge>
                    )}
                  </div>
                  <CardTitle className="text-lg">
                    {conversation.contact_name || conversation.contact_identifier}
                  </CardTitle>
                  {conversation.contact_name && (
                    <p className="text-sm text-muted-foreground">
                      {conversation.contact_identifier}
                    </p>
                  )}
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(parseISO(conversation.created_at), "dd.MM.yyyy, HH:mm", { locale: de })}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Subject (for emails) */}
              {conversation.subject && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Betreff</p>
                  <p className="font-medium">{conversation.subject}</p>
                </div>
              )}

              {/* Message Content */}
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-2">Nachricht</p>
                <div className="bg-muted/50 rounded-lg p-4">
                  <p className="whitespace-pre-wrap text-sm">{conversation.content}</p>
                </div>
              </div>

              {/* Linked Customer */}
              {conversation.customers && (
                <div className="flex items-center gap-2 pt-2 border-t">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Verknüpfter Kunde:</span>
                  <Button
                    variant="link"
                    className="h-auto p-0"
                    onClick={() => navigate(`/customers/${conversation.customers?.id}`)}
                  >
                    {conversation.customers.first_name} {conversation.customers.last_name}
                    <ExternalLink className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardContent className="py-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReprocess}
                  disabled={triggerExtraction.isPending}
                >
                  <RefreshCw className={cn("h-4 w-4 mr-2", triggerExtraction.isPending && "animate-spin")} />
                  {triggerExtraction.isPending ? "Verarbeite..." : "Erneut analysieren"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMarkAsSpam}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Als Spam markieren
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* AI Extraction Panel */}
        <div className="space-y-4">
          {extractedData ? (
            <>
              {/* Classification Badge added to ExtractionPanel header area */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">KI-Extraktion</CardTitle>
                    <div className="flex items-center gap-2">
                      <ClassificationBadge classification={classification} />
                      <Badge variant="outline" className="bg-primary/10">
                        {Math.round((conversation.ai_confidence_score || 0) * 100)}% Konfidenz
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ExtractionPanel data={extractedData} showHeader={false} />
                </CardContent>
              </Card>
              
              {hasExtraction && (
                <ConvertToBookingButton
                  conversationId={conversation.id}
                  extractedData={extractedData}
                  className="w-full"
                />
              )}

              {/* AI Reply Assistant */}
              <AIReplyAssistant
                suggestedReply={suggestedReply}
                onMarkAsDone={handleMarkAsDone}
              />
            </>
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground mb-4">
                  Noch keine KI-Analyse vorhanden
                </p>
                <Button
                  onClick={handleReprocess}
                  disabled={triggerExtraction.isPending}
                >
                  <RefreshCw className={cn("h-4 w-4 mr-2", triggerExtraction.isPending && "animate-spin")} />
                  Jetzt analysieren
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
