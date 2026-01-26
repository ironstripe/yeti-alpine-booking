import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Phone, Mail, ChevronRight } from "lucide-react";
import { useConversations } from "@/hooks/useConversations";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { DashboardTaskCard } from "./DashboardTaskCard";
import { Skeleton } from "@/components/ui/skeleton";

const BOOKING_KEYWORDS = ["buchung", "buchen", "privat", "unterricht", "stunde", "kurs", "reserv", "termin"];

export function NewRequestsBox() {
  const navigate = useNavigate();
  const { data: conversations, isLoading } = useConversations({
    filter: "unread",
    search: "",
    limit: 20,
  });

  const bookingInquiries =
    conversations?.filter((conv) => {
      const contentLower = (conv.content || "").toLowerCase();
      const subjectLower = (conv.subject || "").toLowerCase();
      return BOOKING_KEYWORDS.some(
        (keyword) => contentLower.includes(keyword) || subjectLower.includes(keyword)
      );
    }) || [];

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "whatsapp":
        return <MessageSquare className="h-3 w-3 text-green-600" />;
      case "phone":
        return <Phone className="h-3 w-3 text-blue-600" />;
      case "email":
        return <Mail className="h-3 w-3 text-amber-600" />;
      default:
        return <MessageSquare className="h-3 w-3" />;
    }
  };

  if (isLoading) {
    return (
      <DashboardTaskCard title="Neue Anfragen" count={0}>
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </DashboardTaskCard>
    );
  }

  return (
    <DashboardTaskCard
      title="Neue Anfragen"
      count={bookingInquiries.length}
      isEmpty={bookingInquiries.length === 0}
      emptyMessage="Keine neuen Buchungsanfragen"
    >
      <div className="space-y-2">
        {bookingInquiries.slice(0, 3).map((inquiry) => (
          <div
            key={inquiry.id}
            className="flex items-start justify-between gap-2 p-2 rounded-md bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => navigate(`/inbox?id=${inquiry.id}`)}
          >
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <div className="mt-0.5">{getChannelIcon(inquiry.channel)}</div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {inquiry.contact_name || inquiry.contact_identifier}
                </p>
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {inquiry.subject || inquiry.content?.substring(0, 40)}...
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0">
              Prüfen →
            </Button>
          </div>
        ))}

        {bookingInquiries.length > 3 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-7 text-xs"
            onClick={() => navigate("/inbox")}
          >
            Alle {bookingInquiries.length} anzeigen
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        )}
      </div>
    </DashboardTaskCard>
  );
}
