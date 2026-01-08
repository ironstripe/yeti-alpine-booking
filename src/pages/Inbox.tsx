import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, CheckCheck, ArrowUpDown, FlaskConical } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";
import {
  useConversations,
  useConversationCounts,
  useMarkAllAsRead,
  type ConversationFilter,
} from "@/hooks/useConversations";
import { useInboxStats } from "@/hooks/useInboxStats";
import { ConversationFilters } from "@/components/inbox/ConversationFilters";
import { EnhancedConversationCard } from "@/components/inbox/EnhancedConversationCard";
import { ConversationListSkeleton } from "@/components/inbox/ConversationListSkeleton";
import { ConversationEmptyState } from "@/components/inbox/ConversationEmptyState";
import { InboxQuickStats } from "@/components/inbox/InboxQuickStats";
import { QuickBookingModal } from "@/components/inbox/QuickBookingModal";
import { AITestPanel } from "@/components/inbox/AITestPanel";
import type { ExtractedData } from "@/hooks/useAIExtraction";

type SortOption = "newest" | "oldest" | "confidence";

const Inbox = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const debouncedSearch = useDebounce(searchInput, 300);

  // Quick booking modal state
  const [quickBookingOpen, setQuickBookingOpen] = useState(false);
  const [aiTestOpen, setAiTestOpen] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<{
    id: string;
    extractedData: ExtractedData;
  } | null>(null);

  const { data: counts, isLoading: countsLoading } = useConversationCounts();
  const { data: stats, isLoading: statsLoading } = useInboxStats();
  const { data: conversations, isLoading } = useConversations({
    filter,
    search: debouncedSearch,
  });
  const { markAllAsRead } = useMarkAllAsRead();

  const unreadCount = counts?.unread || 0;

  const handleConversationClick = (id: string) => {
    navigate(`/inbox/${id}`);
  };

  const handleQuickBook = (conversationId: string, extractedData: ExtractedData) => {
    setSelectedConversation({ id: conversationId, extractedData });
    setQuickBookingOpen(true);
  };

  const handleConvertToWizard = () => {
    if (selectedConversation) {
      navigate("/bookings/new", {
        state: {
          prefill: {
            customer: selectedConversation.extractedData.customer,
            participants: selectedConversation.extractedData.participants,
            booking: selectedConversation.extractedData.booking,
          },
          conversation: selectedConversation.id,
        },
      });
    }
  };

  // Sort conversations
  const sortedConversations = [...(conversations || [])].sort((a, b) => {
    switch (sortBy) {
      case "oldest":
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case "confidence": {
        const confA = (a as any).ai_confidence_score || 0;
        const confB = (b as any).ai_confidence_score || 0;
        return confB - confA;
      }
      case "newest":
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  return (
    <>
      <PageHeader
        title={unreadCount > 0 ? `Posteingang (${unreadCount} ungelesen)` : "Posteingang"}
        description="Eingehende Anfragen und Nachrichten"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setAiTestOpen(true)}>
              <FlaskConical className="h-4 w-4 mr-2" />
              KI testen
            </Button>
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={markAllAsRead}>
                <CheckCheck className="h-4 w-4 mr-2" />
                Alle als gelesen markieren
              </Button>
            )}
          </div>
        }
      />

      <div className="space-y-4">
        {/* Quick Stats */}
        <InboxQuickStats
          newCount={stats?.newCount || 0}
          inProgressCount={stats?.inProgressCount || 0}
          overdueCount={stats?.overdueCount || 0}
          autoQuote={stats?.autoQuote || 0}
          isLoading={statsLoading}
        />

        {/* Filters */}
        <ConversationFilters
          activeFilter={filter}
          onFilterChange={setFilter}
          counts={counts || { all: 0, unread: 0, whatsapp: 0, email: 0 }}
        />

        {/* Search and Sort */}
        <div className="flex gap-3">
          <div className="relative flex-1">
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
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-[180px]">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Sortieren" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Neueste zuerst</SelectItem>
              <SelectItem value="oldest">Älteste zuerst</SelectItem>
              <SelectItem value="confidence">Höchste Konfidenz</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Message List */}
        {isLoading ? (
          <ConversationListSkeleton />
        ) : sortedConversations && sortedConversations.length > 0 ? (
          <div className="space-y-3">
            {sortedConversations.map((conversation) => {
              const extractedData = (conversation as any).ai_extracted_data as ExtractedData | null;
              
              return (
                <EnhancedConversationCard
                  key={conversation.id}
                  conversation={conversation as any}
                  onViewDetails={() => handleConversationClick(conversation.id)}
                  onEdit={() => handleConversationClick(conversation.id)}
                  onQuickBook={
                    extractedData?.is_booking_request
                      ? () => handleQuickBook(conversation.id, extractedData)
                      : undefined
                  }
                />
              );
            })}
          </div>
        ) : (
          <Card className="bg-card">
            <CardContent className="p-4">
              <ConversationEmptyState filter={filter} searchTerm={debouncedSearch} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick Booking Modal */}
      {selectedConversation && (
        <QuickBookingModal
          open={quickBookingOpen}
          onOpenChange={setQuickBookingOpen}
          conversationId={selectedConversation.id}
          extractedData={selectedConversation.extractedData}
          onConvertToWizard={handleConvertToWizard}
        />
      )}

      {/* AI Test Panel */}
      <AITestPanel open={aiTestOpen} onOpenChange={setAiTestOpen} />
    </>
  );
};

export default Inbox;
