import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Inbox, Mail, MessageCircle, Phone, ChevronRight } from "lucide-react";
import { useConversations, useMarkAllAsRead } from "@/hooks/useConversations";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { cn } from "@/lib/utils";

const channelIcons: Record<string, typeof Mail> = {
  email: Mail,
  whatsapp: MessageCircle,
  phone: Phone,
};

export function InboxPreview() {
  const navigate = useNavigate();
  const { data: conversations, isLoading } = useConversations({ 
    filter: "unread", 
    search: "",
    limit: 5 
  });
  const { markAllAsRead } = useMarkAllAsRead();

  const unreadCount = conversations?.length || 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Inbox className="h-4 w-4" />
            Posteingang
            {unreadCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                {unreadCount}
              </Badge>
            )}
          </CardTitle>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 text-xs"
              onClick={() => markAllAsRead()}
            >
              Alle gelesen
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {isLoading && (
          <p className="text-xs text-muted-foreground">Laden...</p>
        )}
        
        {!isLoading && unreadCount === 0 && (
          <p className="text-xs text-muted-foreground py-2">
            Keine ungelesenen Nachrichten
          </p>
        )}
        
        {conversations?.slice(0, 5).map((conv) => {
          const Icon = channelIcons[conv.channel] || Mail;
          return (
            <div 
              key={conv.id}
              className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
              onClick={() => navigate("/inbox")}
            >
              <Icon className={cn(
                "h-3.5 w-3.5 shrink-0",
                conv.channel === "whatsapp" && "text-green-600",
                conv.channel === "email" && "text-blue-600"
              )} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {conv.contact_name || conv.contact_identifier}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {conv.content}
                </p>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {formatDistanceToNow(new Date(conv.created_at), { 
                  addSuffix: true, 
                  locale: de 
                })}
              </span>
            </div>
          );
        })}
        
        {unreadCount > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full h-8 text-xs mt-1"
            onClick={() => navigate("/inbox")}
          >
            Alle anzeigen
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
