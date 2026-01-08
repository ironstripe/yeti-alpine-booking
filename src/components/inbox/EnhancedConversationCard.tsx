import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  MessageCircle, 
  Mail, 
  Phone, 
  User, 
  Users, 
  Calendar, 
  Eye,
  Pencil,
  Zap,
  Bot,
  ChevronDown,
  ChevronUp,
  UtensilsCrossed,
} from "lucide-react";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { ConfidenceIndicator } from "./ConfidenceIndicator";
import { useState } from "react";
import type { ExtractedData } from "@/hooks/useAIExtraction";

interface ConversationWithExtraction {
  id: string;
  channel: string;
  contact_name: string | null;
  contact_identifier: string;
  subject: string | null;
  content: string;
  status: string | null;
  direction: string;
  created_at: string;
  customer_id: string | null;
  ai_extracted_data?: ExtractedData | null;
  ai_confidence_score?: number | null;
  customer?: {
    first_name: string | null;
    last_name: string;
  } | null;
}

interface EnhancedConversationCardProps {
  conversation: ConversationWithExtraction;
  onViewDetails: () => void;
  onEdit?: () => void;
  onQuickBook?: () => void;
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

const skillLevelLabels: Record<string, string> = {
  beginner: "Anf.",
  intermediate: "Fortg.",
  advanced: "Exp.",
  unknown: "",
};

function formatTimestamp(dateString: string): string {
  const date = parseISO(dateString);
  
  if (isToday(date)) {
    return `vor ${getMinutesAgo(date)} Min`;
  }
  if (isYesterday(date)) {
    return `Gestern, ${format(date, "HH:mm")}`;
  }
  return format(date, "dd.MM.yyyy", { locale: de });
}

function getMinutesAgo(date: Date): number {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.max(1, Math.floor(diffMs / 60000));
}

function truncateContent(content: string, maxLength = 80): string {
  if (content.length <= maxLength) return content;
  return content.slice(0, maxLength).trim() + "...";
}

export function EnhancedConversationCard({ 
  conversation, 
  onViewDetails,
  onEdit,
  onQuickBook,
}: EnhancedConversationCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const channel = channelConfig[conversation.channel] || channelConfig.email;
  const status = statusConfig[conversation.status || "read"] || statusConfig.read;
  const isUnread = conversation.status === "unread";
  const ChannelIcon = channel.icon;

  const displayName = conversation.contact_name || conversation.contact_identifier;
  const extractedData = conversation.ai_extracted_data as ExtractedData | null;
  const confidence = conversation.ai_confidence_score || extractedData?.confidence || 0;
  const hasExtraction = extractedData?.is_booking_request;
  const canQuickBook = hasExtraction && confidence >= 0.7;

  const participantCount = extractedData?.participants?.length || 0;
  const dateCount = extractedData?.booking?.dates?.length || 0;
  const hasLunch = extractedData?.booking?.lunch_supervision;
  const productType = extractedData?.booking?.product_type;

  return (
    <Card
      className={cn(
        "p-4 transition-all duration-200 hover:shadow-md hover:border-primary/20",
        isUnread && "bg-primary/5 border-primary/20"
      )}
    >
      {/* Header Row */}
      <div className="flex items-start gap-3">
        <div className={cn(
          "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center",
          channel.bgColor
        )}>
          <ChannelIcon className={cn("w-5 h-5", channel.color)} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Top Row: Name, Channel Badge, Time, Status */}
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 min-w-0">
              <span className={cn(
                "font-medium text-foreground truncate",
                isUnread && "font-semibold"
              )}>
                {displayName}
              </span>
              <Badge variant="outline" className="text-xs shrink-0 uppercase">
                {conversation.channel === "whatsapp" ? "WA" : 
                 conversation.channel === "email" ? "E-Mail" : conversation.channel}
              </Badge>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {hasExtraction && (
                <ConfidenceIndicator confidence={confidence} showLabel={false} size="sm" />
              )}
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(conversation.created_at)}
              </span>
              {status.label && (
                <Badge variant={status.variant} className="text-xs">
                  {status.label}
                </Badge>
              )}
            </div>
          </div>

          {/* Contact Identifier */}
          {conversation.contact_name && (
            <p className="text-xs text-muted-foreground mb-1">
              {conversation.contact_identifier}
            </p>
          )}

          {/* Subject (for emails) */}
          {conversation.subject && (
            <p className={cn(
              "text-sm mb-1 truncate",
              isUnread ? "font-medium text-foreground" : "text-muted-foreground"
            )}>
              {conversation.subject}
            </p>
          )}

          {/* Quick Preview Badge Row (if extraction available) */}
          {hasExtraction && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <Badge variant="secondary" className="text-xs gap-1">
                <Users className="h-3 w-3" />
                {participantCount} TN
              </Badge>
              {dateCount > 0 && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Calendar className="h-3 w-3" />
                  {dateCount} Tage
                </Badge>
              )}
              {productType && productType !== "unknown" && (
                <Badge variant="secondary" className="text-xs">
                  {productType === "private" ? "Privat" : "Gruppe"}
                </Badge>
              )}
              {hasLunch && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <UtensilsCrossed className="h-3 w-3" />
                </Badge>
              )}
            </div>
          )}

          {/* Expandable Preview */}
          {!isExpanded && !hasExtraction && (
            <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
              "{truncateContent(conversation.content)}"
            </p>
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && hasExtraction && extractedData && (
        <div className="mt-4 pt-3 border-t">
          <div className="pl-13 space-y-2 text-sm">
            {/* Participants */}
            {extractedData.participants && extractedData.participants.length > 0 && (
              <div className="flex items-start gap-2">
                <Users className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div>
                  {extractedData.participants.map((p, i) => (
                    <span key={i}>
                      {i > 0 && ", "}
                      <span className="font-medium">{p.name}</span>
                      {p.age && ` (${p.age}J`}
                      {p.skill_level && skillLevelLabels[p.skill_level] && 
                        `, ${skillLevelLabels[p.skill_level]}`}
                      {p.age && ")"}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Dates */}
            {extractedData.booking?.dates && extractedData.booking.dates.length > 0 && (
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span>
                  {extractedData.booking.dates.map((d, i) => {
                    try {
                      return (i > 0 ? ", " : "") + format(parseISO(d.date), "EEE dd.MM.", { locale: de });
                    } catch {
                      return (i > 0 ? ", " : "") + d.date;
                    }
                  })}
                </span>
              </div>
            )}

            {/* AI Notes */}
            {extractedData.notes && (
              <div className="flex items-start gap-2 text-yellow-600 bg-yellow-50 p-2 rounded text-xs">
                <Bot className="h-3 w-3 mt-0.5" />
                <span>{extractedData.notes}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Row */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="h-3 w-3 mr-1" />
              Weniger
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3 mr-1" />
              Vorschau
            </>
          )}
        </Button>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetails();
            }}
          >
            <Eye className="h-3 w-3 mr-1" />
            Details
          </Button>
          
          {onEdit && hasExtraction && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
            >
              <Pencil className="h-3 w-3 mr-1" />
              Bearbeiten
            </Button>
          )}
          
          {onQuickBook && canQuickBook && (
            <Button
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onQuickBook();
              }}
            >
              <Zap className="h-3 w-3 mr-1" />
              Schnellbuchung
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
