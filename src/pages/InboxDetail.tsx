import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
  const triggerExtraction = useTriggerAIExtraction();

  const { data: conversation, isLoading, error, refetch } = useQuery({
    queryKey: ["conversation", id],
    queryFn: async () => {
      if (!id) throw new Error("No ID provided");

      const { data, error } = await supabase
        .from("conversations")
        .select(`
          *,
          customers (
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
              <ExtractionPanel data={extractedData} />
              
              {hasExtraction && (
                <ConvertToBookingButton
                  conversationId={conversation.id}
                  extractedData={extractedData}
                  className="w-full"
                />
              )}
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
