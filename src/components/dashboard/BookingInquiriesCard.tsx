import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalendarPlus, ChevronRight, MessageSquare, Phone, Mail } from "lucide-react";
import { useConversations } from "@/hooks/useConversations";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

// Keywords that indicate a booking inquiry
const BOOKING_KEYWORDS = ["buchung", "buchen", "privat", "unterricht", "stunde", "kurs", "reserv", "termin"];

export function BookingInquiriesCard() {
  const navigate = useNavigate();
  const { data: conversations, isLoading } = useConversations({ filter: "unread", search: "", limit: 20 });

  // Filter conversations that likely contain booking requests
  const bookingInquiries = conversations?.filter((conv) => {
    const contentLower = (conv.content || "").toLowerCase();
    const subjectLower = (conv.subject || "").toLowerCase();
    return BOOKING_KEYWORDS.some(
      (keyword) => contentLower.includes(keyword) || subjectLower.includes(keyword)
    );
  }) || [];

  const inquiryCount = bookingInquiries.length;

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

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <CalendarPlus className="h-4 w-4" />
          Neue Buchungsanfragen
          {inquiryCount > 0 && (
            <Badge variant="outline" className="ml-auto text-xs bg-blue-100 text-blue-800 border-blue-300">
              {inquiryCount} neu
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && (
          <p className="text-xs text-muted-foreground">Laden...</p>
        )}

        {!isLoading && inquiryCount === 0 && (
          <p className="text-xs text-muted-foreground py-2">
            Keine neuen Buchungsanfragen
          </p>
        )}

        {bookingInquiries.slice(0, 3).map((inquiry) => (
          <div
            key={inquiry.id}
            className="flex items-start gap-2 p-2 rounded-md bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => navigate(`/inbox?id=${inquiry.id}`)}
          >
            <div className="mt-0.5">{getChannelIcon(inquiry.channel)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {inquiry.contact_name || inquiry.contact_identifier}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-1">
                {inquiry.subject || inquiry.content?.substring(0, 60)}...
              </p>
              <p className="text-xs text-muted-foreground/70 mt-0.5">
                {formatDistanceToNow(new Date(inquiry.created_at), {
                  addSuffix: true,
                  locale: de,
                })}
              </p>
            </div>
          </div>
        ))}

        {inquiryCount > 3 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full h-8 text-xs"
            onClick={() => navigate("/inbox")}
          >
            Alle {inquiryCount} anzeigen
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
