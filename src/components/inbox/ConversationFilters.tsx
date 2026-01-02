import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import type { ConversationFilter } from "@/hooks/useConversations";

interface ConversationFiltersProps {
  activeFilter: ConversationFilter;
  onFilterChange: (filter: ConversationFilter) => void;
  counts: {
    all: number;
    unread: number;
    whatsapp: number;
    email: number;
  };
}

export function ConversationFilters({ activeFilter, onFilterChange, counts }: ConversationFiltersProps) {
  return (
    <Tabs value={activeFilter} onValueChange={(v) => onFilterChange(v as ConversationFilter)}>
      <TabsList className="w-full sm:w-auto grid grid-cols-4 sm:flex">
        <TabsTrigger value="all" className="gap-1.5">
          Alle
          <Badge variant="secondary" className="text-xs px-1.5 py-0">
            {counts.all}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="unread" className="gap-1.5">
          Ungelesen
          {counts.unread > 0 && (
            <Badge className="text-xs px-1.5 py-0">
              {counts.unread}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="whatsapp" className="gap-1.5">
          WhatsApp
          <Badge variant="secondary" className="text-xs px-1.5 py-0">
            {counts.whatsapp}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="email" className="gap-1.5">
          E-Mail
          <Badge variant="secondary" className="text-xs px-1.5 py-0">
            {counts.email}
          </Badge>
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
