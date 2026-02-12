import { useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Settings, MessageSquare, Send, Loader2, User } from "lucide-react";
import { useUnifiedTimeline, type TimelineEntry } from "@/hooks/useTicketHistory";
import { useCreateTicketComment } from "@/hooks/useTicketComments";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TicketTimelineProps {
  ticketId: string;
}

export function TicketTimeline({ ticketId }: TicketTimelineProps) {
  const { data: timeline, isLoading } = useUnifiedTimeline(ticketId);
  const createComment = useCreateTicketComment();
  const [newComment, setNewComment] = useState("");

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Nicht angemeldet", { duration: 5000 });
      return;
    }

    try {
      await createComment.mutateAsync({
        ticket_id: ticketId,
        comment_type: "internal",
        content: newComment.trim(),
        created_by_user_id: user.id,
        created_by_name: user.email || "Benutzer",
      });
      setNewComment("");
      toast.success("Kommentar hinzugefügt", { duration: 3000 });
    } catch {
      toast.error("Fehler beim Speichern", { duration: 5000 });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Comment input */}
      <div className="flex gap-2">
        <Textarea
          placeholder="Kommentar hinzufügen..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          className="min-h-[60px]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              handleAddComment();
            }
          }}
        />
        <Button
          onClick={handleAddComment}
          disabled={!newComment.trim() || createComment.isPending}
          size="sm"
          className="self-end"
        >
          {createComment.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Timeline */}
      {timeline.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          Noch keine Einträge vorhanden
        </p>
      ) : (
        <div className="space-y-3">
          {[...timeline].reverse().map((entry) => (
            <TimelineItem key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

function TimelineItem({ entry }: { entry: TimelineEntry }) {
  const isComment = entry.source === "comment";

  return (
    <div className="flex gap-3 py-2">
      <Avatar className="h-8 w-8 mt-0.5">
        <AvatarFallback className={isComment ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}>
          {isComment ? (
            entry.actorName ? entry.actorName.charAt(0).toUpperCase() : <User className="h-4 w-4" />
          ) : (
            <Settings className="h-4 w-4" />
          )}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={isComment ? "secondary" : "outline"} className="text-xs">
            {isComment ? <MessageSquare className="h-3 w-3 mr-1" /> : <Settings className="h-3 w-3 mr-1" />}
            {entry.type}
          </Badge>
          {entry.actorName && (
            <span className="text-xs text-muted-foreground">{entry.actorName}</span>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {format(new Date(entry.timestamp), "dd.MM.yyyy HH:mm", { locale: de })}
          </span>
        </div>
        {entry.content && (
          <p className="text-sm mt-1 whitespace-pre-wrap">{entry.content}</p>
        )}
      </div>
    </div>
  );
}
