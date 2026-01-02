import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Mail, Phone, User } from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { ConversationWithCustomer } from "@/hooks/useConversations";

interface ConversationCardProps {
  conversation: ConversationWithCustomer;
  onClick: () => void;
}

const channelConfig: Record<string, { icon: typeof Mail; color: string; bgColor: string }> = {
  whatsapp: { icon: MessageCircle, color: "text-green-600", bgColor: "bg-green-100" },
  email: { icon: Mail, color: "text-blue-600", bgColor: "bg-blue-100" },
  phone: { icon: Phone, color: "text-muted-foreground", bgColor: "bg-muted" },
  walkin: { icon: User, color: "text-purple-600", bgColor: "bg-purple-100" },
};

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  unread: { label: "Neu", variant: "default" },
  read: { label: "", variant: "secondary" },
  in_progress: { label: "In Bearbeitung", variant: "secondary" },
  processed: { label: "Erledigt", variant: "outline" },
  archived: { label: "Archiviert", variant: "outline" },
};

function formatTimestamp(dateString: string): string {
  const date = parseISO(dateString);
  
  if (isToday(date)) {
    return `Heute, ${format(date, "HH:mm")}`;
  }
  if (isYesterday(date)) {
    return `Gestern, ${format(date, "HH:mm")}`;
  }
  return format(date, "dd.MM.yyyy", { locale: de });
}

function truncateContent(content: string, maxLength = 100): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength).trim() + "...";
}

export function ConversationCard({ conversation, onClick }: ConversationCardProps) {
  const channel = channelConfig[conversation.channel] || channelConfig.email;
  const status = statusConfig[conversation.status || "read"] || statusConfig.read;
  const isUnread = conversation.status === "unread";
  const ChannelIcon = channel.icon;

  const displayName = conversation.contact_name || conversation.contact_identifier;
  const customerName = conversation.customer
    ? `${conversation.customer.first_name || ""} ${conversation.customer.last_name}`.trim()
    : null;

  return (
    <Card
      onClick={onClick}
      className={cn(
        "p-4 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/20",
        isUnread && "bg-primary/5 border-primary/20"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Channel Icon */}
        <div className={cn("flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center", channel.bgColor)}>
          <ChannelIcon className={cn("w-5 h-5", channel.color)} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header Row */}
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className={cn("font-medium text-foreground truncate", isUnread && "font-semibold")}>
                {displayName}
              </span>
              <Badge variant="outline" className="text-xs shrink-0 uppercase">
                {conversation.channel === "whatsapp" ? "WA" : conversation.channel === "email" ? "E-Mail" : conversation.channel}
              </Badge>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted-foreground">{formatTimestamp(conversation.created_at)}</span>
              {isUnread && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
            </div>
          </div>

          {/* Contact Identifier (if different from name) */}
          {conversation.contact_name && (
            <p className="text-xs text-muted-foreground mb-1">{conversation.contact_identifier}</p>
          )}

          {/* Subject (for emails) */}
          {conversation.subject && (
            <p className={cn("text-sm mb-1 truncate", isUnread ? "font-medium text-foreground" : "text-muted-foreground")}>
              {conversation.subject}
            </p>
          )}

          {/* Content Preview */}
          <p className="text-sm text-muted-foreground line-clamp-2">
            "{truncateContent(conversation.content)}"
          </p>

          {/* Footer Row */}
          <div className="flex items-center justify-between gap-2 mt-2">
            {/* Linked Customer */}
            {customerName && (
              <Badge variant="secondary" className="text-xs">
                Verknüpft: {customerName}
              </Badge>
            )}
            
            {/* Status Badge */}
            {status.label && (
              <Badge variant={status.variant} className="text-xs ml-auto">
                {status.label}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
