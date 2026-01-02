import { Inbox, Search, CheckCircle2 } from "lucide-react";
import type { ConversationFilter } from "@/hooks/useConversations";

interface ConversationEmptyStateProps {
  filter: ConversationFilter;
  searchTerm: string;
}

export function ConversationEmptyState({ filter, searchTerm }: ConversationEmptyStateProps) {
  if (searchTerm) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Search className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold font-display mb-2">Keine Ergebnisse</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Keine Nachrichten gefunden für "{searchTerm}"
        </p>
      </div>
    );
  }

  if (filter === "unread") {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-8 h-8 text-green-600" />
        </div>
        <h3 className="text-lg font-semibold font-display mb-2">Alles erledigt!</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Keine ungelesenen Nachrichten vorhanden.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Inbox className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold font-display mb-2">Keine Nachrichten</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        {filter === "whatsapp" && "Noch keine WhatsApp-Nachrichten eingegangen."}
        {filter === "email" && "Noch keine E-Mails eingegangen."}
        {filter === "all" && "Noch keine Nachrichten eingegangen."}
      </p>
    </div>
  );
}
