import { useState } from "react";
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
  ExternalLink,
  Globe,
  Zap,
  CheckCircle,
  Loader2
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { ExtractionPanel } from "@/components/inbox/ExtractionPanel";
import { ConvertToBookingButton } from "@/components/inbox/ConvertToBookingButton";
import { ClassificationBadge, type MessageClassification } from "@/components/inbox/ClassificationBadge";
import { AIReplyAssistant } from "@/components/inbox/AIReplyAssistant";
import { ConfidenceIndicator } from "@/components/inbox/ConfidenceIndicator";
import { BookingReadyBadge, getMissingRequiredFields, calculateDataCompleteness, isBookingReady } from "@/components/inbox/BookingReadyBadge";
import { CustomerStatusBadge } from "@/components/inbox/CustomerStatusBadge";
import { CustomerContextPanel } from "@/components/inbox/CustomerContextPanel";
import { AmbiguousCustomerMatch } from "@/components/inbox/AmbiguousCustomerMatch";
import { useTriggerAIExtraction, type ExtractedData } from "@/hooks/useAIExtraction";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface SuggestedReply {
  to: string;
  subject: string;
  body: string;
}

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
  
  // Quick booking creation state
  const [isCreatingBooking, setIsCreatingBooking] = useState(false);
  const [createdTicket, setCreatedTicket] = useState<{
    id: string;
    ticket_number: string;
  } | null>(null);

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

  // Pre-extract data for the query (needed before early returns)
  const extractedDataForQuery = conversation?.ai_extracted_data as unknown as ExtractedData | null;

  // Fetch AI-generated reply from the generate-reply Edge Function
  // IMPORTANT: This hook must be before early returns to maintain consistent hook order
  const { 
    data: suggestedReplyData, 
    isLoading: isReplyLoading,
    refetch: refetchReply,
    error: replyError
  } = useQuery({
    queryKey: ["generate-reply", id],
    queryFn: async () => {
      if (!id) throw new Error("No ID provided");

      console.log("Calling generate-reply for conversation:", id);
      console.log("Extracted data available:", !!extractedDataForQuery);

      const { data, error } = await supabase.functions.invoke("generate-reply", {
        body: { conversationId: id },
      });

      if (error) {
        console.error("generate-reply error:", error);
        throw error;
      }
      
      console.log("generate-reply response:", data);
      return data as { suggested_reply: SuggestedReply };
    },
    // Fetch when we have a conversation (with or without extraction data)
    enabled: !!id && !!conversation,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
    retry: 1,
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

  // Quick create booking handler - synchronized with ConvertToBookingButton logic
  const handleQuickCreateBooking = async () => {
    if (!id) return;
    
    setIsCreatingBooking(true);
    toast.info("Erstelle Buchung...");

    try {
      // Resolve customer ID - same logic as ConvertToBookingButton
      let resolvedCustomerId = conversation?.matched_customer_id || null;
      const customerEmail = extractedDataForQuery?.customer?.email;
      
      // If no matched customer, try to find by email (same as ConvertToBookingButton)
      if (!resolvedCustomerId && customerEmail) {
        console.log("Looking up customer by email:", customerEmail);
        const { data: existingCustomer } = await supabase
          .from("customers")
          .select("id")
          .eq("email", customerEmail)
          .maybeSingle();
        
        if (existingCustomer) {
          console.log("Found existing customer by email:", existingCustomer.id);
          resolvedCustomerId = existingCustomer.id;
        }
      }

      console.log("Calling create-booking-from-extraction with:", {
        conversationId: id,
        customerId: resolvedCustomerId,
      });

      const { data, error } = await supabase.functions.invoke(
        "create-booking-from-extraction",
        {
          body: {
            conversationId: id,
            customerId: resolvedCustomerId,
            sendConfirmationAfterApproval: true,
          },
        }
      );

      console.log("Edge function response:", { data, error });

      if (error) {
        console.error("Edge function invocation error:", error);
        throw new Error(error.message || "Fehler bei der Funktionsaufruf");
      }

      if (!data.success) {
        console.error("Booking creation failed:", data);
        throw new Error(data.error || "Buchung konnte nicht erstellt werden");
      }

      setCreatedTicket({
        id: data.ticket.id,
        ticket_number: data.ticket.ticket_number,
      });
      toast.success(
        `Buchung ${data.ticket.ticket_number} erstellt. Wartet auf Bestätigung.`
      );
      queryClient.invalidateQueries({ queryKey: ["pending-confirmations"] });
      refetch();
    } catch (error) {
      console.error("Error creating booking:", error);
      const message = error instanceof Error ? error.message : "Fehler beim Erstellen der Buchung";
      toast.error(message);
    } finally {
      setIsCreatingBooking(false);
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
  
  // Get detected language from database
  const detectedLanguage = (conversation as any).detected_language || extractedData?.detected_language || "de";


  // Use real data if available, otherwise provide a fallback
  const suggestedReply: SuggestedReply = suggestedReplyData?.suggested_reply || {
    to: conversation.contact_identifier,
    subject: `Re: ${conversation.subject || "Ihre Anfrage"}`,
    body: isReplyLoading ? "Antwort wird generiert..." : "Keine Antwort verfügbar. Klicken Sie auf 'Neu generieren'.",
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
                    <CustomerStatusBadge isExistingCustomer={!!conversation.matched_customer_id} />
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
          {/* Ambiguous Customer Match */}
          {extractedData?.customer_match_method === "ambiguous" && extractedData?.customer_match_candidates && (
            <AmbiguousCustomerMatch
              conversationId={conversation.id}
              candidates={extractedData.customer_match_candidates as any[]}
              onResolved={() => refetch()}
            />
          )}

          {/* Customer Context Panel (for matched customers) */}
          {conversation.matched_customer_id && (
            <CustomerContextPanel customerId={conversation.matched_customer_id} />
          )}

          {extractedData ? (
            <>
              {/* Classification Badge added to ExtractionPanel header area */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">KI-Extraktion</CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                      <ClassificationBadge classification={classification} />
                      {detectedLanguage && (
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          {detectedLanguage === "de" ? "DE" : "EN"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {/* Rule-based confidence and booking ready indicators */}
                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t">
                    <BookingReadyBadge 
                      isReady={extractedData?.booking_ready ?? isBookingReady(extractedData)} 
                      missingFields={getMissingRequiredFields(extractedData)}
                    />
                    <ConfidenceIndicator 
                      completeness={extractedData?.data_completeness ?? calculateDataCompleteness(extractedData)} 
                      showLabel={true}
                      size="md"
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <ExtractionPanel data={extractedData} showHeader={false} />
                </CardContent>
              </Card>
              
              {/* Quick Booking Actions */}
              {hasExtraction && !conversation.related_ticket_id && !createdTicket && (
                <div className="flex gap-2">
                  {(extractedData?.booking_ready || isBookingReady(extractedData)) && (
                    <Button
                      onClick={handleQuickCreateBooking}
                      disabled={isCreatingBooking}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      {isCreatingBooking ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Zap className="h-4 w-4 mr-2" />
                      )}
                      Schnell-Buchung
                    </Button>
                  )}
                  <ConvertToBookingButton
                    conversationId={conversation.id}
                    extractedData={extractedData}
                    matchedCustomerId={conversation.matched_customer_id}
                    className="flex-1"
                  />
                </div>
              )}

              {(conversation.related_ticket_id || createdTicket) && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => navigate(`/bookings/${conversation.related_ticket_id || createdTicket?.id}`)}
                >
                  <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                  Buchung {createdTicket?.ticket_number || ""} anzeigen
                </Button>
              )}

              {/* AI Reply Assistant */}
              {replyError && (
                <Card className="border-destructive">
                  <CardContent className="py-4">
                    <p className="text-sm text-destructive">
                      Fehler beim Generieren der Antwort: {replyError instanceof Error ? replyError.message : 'Unbekannter Fehler'}
                    </p>
                  </CardContent>
                </Card>
              )}
              <AIReplyAssistant
                suggestedReply={suggestedReply}
                onMarkAsDone={handleMarkAsDone}
                onRegenerate={() => refetchReply()}
                isRegenerating={isReplyLoading}
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
