import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Search, CheckCheck } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import {
  useConversations,
  useConversationCounts,
  useMarkAllAsRead,
  type ConversationFilter,
} from "@/hooks/useConversations";
import { ConversationFilters } from "@/components/inbox/ConversationFilters";
import { ConversationCard } from "@/components/inbox/ConversationCard";
import { ConversationListSkeleton } from "@/components/inbox/ConversationListSkeleton";
import { ConversationEmptyState } from "@/components/inbox/ConversationEmptyState";

const Inbox = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebounce(searchInput, 300);

  const { data: counts, isLoading: countsLoading } = useConversationCounts();
  const { data: conversations, isLoading } = useConversations({
    filter,
    search: debouncedSearch,
  });
  const { markAllAsRead } = useMarkAllAsRead();

  const unreadCount = counts?.unread || 0;

  const handleConversationClick = (id: string) => {
    // Navigate to detail view (to be implemented)
    navigate(`/inbox/${id}`);
  };

  return (
    <>
      <PageHeader
        title={unreadCount > 0 ? `Posteingang (${unreadCount} ungelesen)` : "Posteingang"}
        description="Alle Nachrichten an einem Ort"
        actions={
          unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllAsRead}>
              <CheckCheck className="h-4 w-4 mr-2" />
              Alle als gelesen markieren
            </Button>
          )
        }
      />

      <div className="space-y-4">
        {/* Filters */}
        <ConversationFilters
          activeFilter={filter}
          onFilterChange={setFilter}
          counts={counts || { all: 0, unread: 0, whatsapp: 0, email: 0 }}
        />

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suche in Nachrichten..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-10"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
          />
        </div>

        {/* Message List */}
        <Card className="bg-card">
          <CardContent className="p-4">
            {isLoading ? (
              <ConversationListSkeleton />
            ) : conversations && conversations.length > 0 ? (
              <div className="space-y-3">
                {conversations.map((conversation) => (
                  <ConversationCard
                    key={conversation.id}
                    conversation={conversation}
                    onClick={() => handleConversationClick(conversation.id)}
                  />
                ))}
              </div>
            ) : (
              <ConversationEmptyState filter={filter} searchTerm={debouncedSearch} />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default Inbox;
