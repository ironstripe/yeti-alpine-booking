import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, User } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { Tables } from "@/integrations/supabase/types";

interface GroupSelectorProps {
  selectedDates: string[];
  sport: "ski" | "snowboard" | null;
  level: string | null;
  selectedGroupId: string | null;
  onGroupSelect: (groupId: string | null) => void;
}

interface GroupWithCapacity extends Tables<"groups"> {
  currentCount: number;
  instructor?: Tables<"instructors">;
}

export function GroupSelector({
  selectedDates,
  sport,
  level,
  selectedGroupId,
  onGroupSelect,
}: GroupSelectorProps) {
  // Fetch available groups for the selected dates
  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["groups", selectedDates, sport, level],
    queryFn: async () => {
      if (selectedDates.length === 0) return [];

      const startDate = selectedDates.sort()[0];
      const endDate = selectedDates.sort()[selectedDates.length - 1];

      // Get groups that overlap with selected dates
      const { data: groupsData, error } = await supabase
        .from("groups")
        .select("*, instructor:instructors(*)")
        .lte("start_date", endDate)
        .gte("end_date", startDate)
        .eq("status", "planned");

      if (error) throw error;

      // TODO: Calculate current enrollment count from ticket_items
      // For now, return groups with mock capacity
      return (groupsData || []).map((g) => ({
        ...g,
        currentCount: Math.floor(Math.random() * (g.max_participants || 10)),
        instructor: g.instructor,
      })) as GroupWithCapacity[];
    },
    enabled: selectedDates.length > 0,
  });

  // Filter groups by sport if specified
  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      if (sport && g.sport && g.sport !== sport) return false;
      return true;
    });
  }, [groups, sport]);

  const selectedGroup = useMemo(() => {
    return filteredGroups.find((g) => g.id === selectedGroupId);
  }, [filteredGroups, selectedGroupId]);

  if (selectedDates.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        Wählen Sie zuerst Kurstage
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        <Users className="h-3 w-3" />
        Gruppe auswählen
      </Label>

      <Select
        value={selectedGroupId || ""}
        onValueChange={(value) => onGroupSelect(value || null)}
        disabled={isLoading}
      >
        <SelectTrigger className="h-9">
          <SelectValue placeholder={isLoading ? "Laden..." : "Gruppe wählen"} />
        </SelectTrigger>
        <SelectContent>
          {filteredGroups.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              Keine passenden Gruppen gefunden
            </div>
          ) : (
            filteredGroups.map((group) => {
              const isFull = group.currentCount >= (group.max_participants || 10);
              const capacityPercent =
                (group.currentCount / (group.max_participants || 10)) * 100;

              return (
                <SelectItem
                  key={group.id}
                  value={group.id}
                  disabled={isFull}
                  className={cn(isFull && "opacity-50")}
                >
                  <div className="flex items-center gap-2 w-full">
                    {/* Level indicator */}
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full",
                        group.level === "anfaenger"
                          ? "bg-green-500"
                          : group.level === "blue_prince"
                          ? "bg-blue-500"
                          : group.level === "red_king"
                          ? "bg-red-500"
                          : "bg-gray-400"
                      )}
                    />
                    <span className="flex-1 truncate">{group.name}</span>
                    <Badge
                      variant={isFull ? "destructive" : "secondary"}
                      className="text-[10px] h-5 px-1.5"
                    >
                      {group.currentCount}/{group.max_participants || 10}
                    </Badge>
                  </div>
                </SelectItem>
              );
            })
          )}
        </SelectContent>
      </Select>

      {/* Selected group instructor display */}
      {selectedGroup && selectedGroup.instructor && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-2 py-1.5">
          <User className="h-3 w-3" />
          <span>
            Leiter: {selectedGroup.instructor.first_name}{" "}
            {selectedGroup.instructor.last_name}
          </span>
        </div>
      )}
    </div>
  );
}
